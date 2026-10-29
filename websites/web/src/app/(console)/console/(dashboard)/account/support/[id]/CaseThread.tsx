"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  KIND_LABEL,
  STATUS_LABEL,
  assistStep,
  closeCase,
  getCase,
  getMyUnreadCases,
  rateCase,
  reopenCase,
  replyToCase,
  sideOf,
  type AssistAction,
  type CaseMessage,
  type SupportCase,
} from "@/lib/api/support";
import { cancelTicket } from "@/lib/api/tickets";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";
import { useAccount } from "../../AccountShell";

const FIELD =
  "w-full rounded-3xl bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST });

/** The app's support thread for the person who raised it: the chat, Assist's actions, and solve, reopen and rate. */
export default function CaseThread({ id }: { id: string }) {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const { setUnread } = useAccount();
  const [c, setCase] = useState<SupportCase | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(() => getCase(token, id).then(setCase), [token, id]);

  useEffect(() => {
    if (!token) return;
    // Opening the case reads it on the server, so the Support tab count follows.
    load().then(
      () => getMyUnreadCases(token).then((n) => setUnread((u) => ({ ...u, support: n })), () => {}),
      (e) => setError(e instanceof Error ? e.message : "Couldn't load this request."),
    );
  }, [token, load, setUnread]);

  const act = async (key: string, fn: () => Promise<unknown>, after?: string) => {
    setBusy(key);
    setError("");
    setDone("");
    try {
      await fn();
      if (after) setDone(after);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  };

  if (!c)
    return error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading the request…</p>;

  const closed = c.status === "CLOSED";
  const bot = c.status === "BOT";
  const withUnifesto = c.desk === "PLATFORM";
  const spaceName = c.space?.name ?? "the organiser";
  // Who answered for the desk then: the organiser while it sat on their desk, Unifesto otherwise.
  const deskName = (iso: string) =>
    c.space && (!withUnifesto || (!!c.escalatedAt && iso < c.escalatedAt)) ? c.space.name : "Unifesto";

  const send = (e: FormEvent) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    act("send", async () => {
      // While with Assist the answer comes back in the same call.
      if (bot) setCase(await assistStep(token, id, body));
      else {
        await replyToCase(token, id, body);
        await load();
      }
      setReply("");
    });
  };

  return (
    <div className="space-y-6">
      <Link href="/console/account/support" className="text-sm text-paper/65 hover:text-paper hover:underline">
        ← My requests
      </Link>
      <div>
        <h2 className="font-display text-xl text-paper">{c.subject}</h2>
        <p className="mt-1 text-xs text-paper/60">
          {[`#${c.ticketNumber}`, KIND_LABEL[c.kind] ?? c.kind, STATUS_LABEL[c.status] ?? c.status, withUnifesto ? "With Unifesto" : `With ${spaceName}`].join(" · ")}
        </p>
      </div>

      <ol className="space-y-4">
        {(c.messages ?? []).map((m) => (
          <Message
            key={m.id}
            m={m}
            name={sideOf(m) === "ASSISTANT" ? "Assist" : sideOf(m) === "DESK" ? deskName(m.createdAt) : "Me"}
            actions={bot && m.actions?.length ? <AssistActions actions={m.actions} busy={busy} act={act} reload={load} token={token} /> : null}
          />
        ))}
      </ol>

      {done && <p className="text-sm text-primary">{done}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!closed && (
        <form onSubmit={send} className="space-y-3">
          <textarea
            required
            rows={3}
            maxLength={4000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={bot ? "Ask Assist" : "Reply"}
            aria-label={bot ? "My question for Assist" : "My reply"}
            className={`${FIELD} resize-y`}
          />
          <button type="submit" disabled={!!busy || !reply.trim()} className="btn btn-sm btn-primary disabled:opacity-40">
            {busy === "send" ? "Sending…" : "Send"}
          </button>
        </form>
      )}

      {bot ? (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => act("person", async () => setCase(await assistStep(token, id)))}
          className="text-sm text-paper/75 hover:text-paper hover:underline"
        >
          {busy === "person" ? "Passing it on…" : "Talk to a person"}
        </button>
      ) : (
        <div className="space-y-6">
          {(closed || c.status === "RESOLVED") && <RateCase c={c} busy={busy} act={act} onRate={(r, note) => rateCase(token, id, r, note).then(load)} />}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act("toggle", async () => {
              await (closed ? reopenCase(token, id) : closeCase(token, id));
              await load();
            })}
            className="text-sm text-paper/75 hover:text-paper hover:underline"
          >
            {closed ? "Reopen request" : "Mark as solved"}
          </button>
        </div>
      )}
    </div>
  );
}

function Message({ m, name, actions }: { m: CaseMessage; name: string; actions: React.ReactNode }) {
  if (sideOf(m) === "SYSTEM") return <li className="text-center text-xs text-paper/55">{m.body}</li>;
  const mine = sideOf(m) === "REQUESTER";
  return (
    <li className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      <span className="text-xs text-paper/55">
        {name} · {stamp(m.createdAt)}
      </span>
      <p className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm ${mine ? "bg-primary/15 text-paper" : "bg-canvas text-paper/90"}`}>{m.body}</p>
      {actions}
    </li>
  );
}

type Act = (key: string, fn: () => Promise<unknown>, after?: string) => Promise<void>;

/** Assist only proposes. A refund goes to the ticket's own refund form; a cancel is confirmed here and runs the ticket page's cancel. */
function AssistActions({ actions, busy, act, reload, token }: { actions: AssistAction[]; busy: string; act: Act; reload: () => Promise<void>; token: string }) {
  const [sure, setSure] = useState("");
  return (
    <div className="flex max-w-[85%] flex-col items-start gap-2">
      {actions.map((a) =>
        a.type === "REQUEST_REFUND" ? (
          <Link key={`${a.type}:${a.registrationId}`} href={`/console/tickets/${a.registrationId}`} className="btn btn-sm btn-secondary">
            {a.label}
          </Link>
        ) : sure === a.registrationId ? (
          <div key={`${a.type}:${a.registrationId}`} className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                act(`cancel:${a.registrationId}`, async () => {
                  await cancelTicket(token, a.registrationId, "Cancelled from Assist");
                  setSure("");
                  await reload();
                }, `${a.eventTitle}: ticket cancelled.`)
              }
              className="btn btn-sm btn-secondary"
            >
              {busy === `cancel:${a.registrationId}` ? "Cancelling…" : `Yes, cancel my ${a.eventTitle} ticket`}
            </button>
            <button type="button" onClick={() => setSure("")} className="text-sm text-paper/70 hover:underline">
              Keep it
            </button>
          </div>
        ) : (
          <button key={`${a.type}:${a.registrationId}`} type="button" onClick={() => setSure(a.registrationId)} className="btn btn-sm btn-secondary">
            {a.label}
          </button>
        ),
      )}
    </div>
  );
}

/** D20: rate a solved request 1 to 5, with an optional note. Rating again isn't offered, as in the app. */
function RateCase({ c, busy, act, onRate }: { c: SupportCase; busy: string; act: Act; onRate: (rating: number, note?: string) => Promise<void> }) {
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  if (c.rating) return <p className="text-sm text-paper/65">I rated this {c.rating} of 5. Thanks for telling us.</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (rating) act("rate", () => onRate(rating, note.trim() || undefined));
      }}
      className="space-y-3"
    >
      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-paper">How did we do?</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className={`grid h-10 min-w-10 cursor-pointer place-items-center rounded-full px-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/60 ${
                rating === n ? "bg-primary text-ink" : "bg-canvas text-paper/80 hover:text-paper"
              }`}
            >
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      {rating && (
        <>
          <textarea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything to add? (optional)"
            aria-label="Anything to add"
            className={`${FIELD} resize-y`}
          />
          <button type="submit" disabled={!!busy} className="btn btn-sm btn-primary">
            {busy === "rate" ? "Sending…" : "Send rating"}
          </button>
        </>
      )}
    </form>
  );
}
