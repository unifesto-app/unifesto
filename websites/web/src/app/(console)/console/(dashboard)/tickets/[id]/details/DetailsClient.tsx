"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { SignInPrompt } from "@/console/components/shared/SignInPrompt";
import { Question } from "@/components/FormQuestion";
import { getEventFields, visibleFieldIds, type FormField } from "@/lib/api/registration";
import { findTicket, getMyDetails, updateMyDetails, type Answers, type MyDetails, type Ticket } from "@/lib/api/tickets";
import { useWebSession } from "@/lib/auth";
import { TicketsFrame, when } from "../../TicketsClient";

/**
 * The app's Edit details: my answers to the organiser's questions while the
 * organiser allows changes. A solo attendee edits their answers; a group lead
 * the team's answers and their own; a member their own. Name, email and phone
 * aren't changed here. File questions stay as they are (and still get sent,
 * because a save replaces the whole set).
 */
export default function DetailsClient({ id }: { id: string }) {
  const { session, ready } = useWebSession();
  const token = session?.token ?? "";
  const [t, setT] = useState<Ticket | null>(null);
  const [details, setDetails] = useState<MyDetails | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [team, setTeam] = useState<Answers>({});
  const [mine, setMine] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let live = true;
    Promise.all([findTicket(token, id), getMyDetails(token, id)])
      .then(async ([ticket, d]) => {
        if (!live) return;
        if (!ticket) return setError("This ticket isn't on my account.");
        const all = await getEventFields(ticket.event.id);
        if (!live) return;
        setT(ticket);
        setDetails(d);
        setFields(all.filter((f) => !f.ticketTypeId || f.ticketTypeId === d.ticketTypeId).sort((a, b) => a.order - b.order));
        setTeam(d.formResponses ?? {});
        setMine(d.member?.customFields ?? {});
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load my details."));
    return () => {
      live = false;
    };
  }, [token, id]);

  if (!ready) return <TicketsFrame title="My details">{null}</TicketsFrame>;
  if (!session)
    return (
      <TicketsFrame title="My details">
        <SignInPrompt />
      </TicketsFrame>
    );
  if (!details || !t)
    return <TicketsFrame title="My details">{error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-muted-foreground">Loading…</p>}</TicketsFrame>;

  const editable = (f: FormField) => f.type !== "FILE";
  const teamFields = (details.isGroup ? fields.filter((f) => f.perGroup) : fields).filter(editable);
  const memberFields = fields.filter((f) => !f.perGroup).filter(editable);
  const sections = [
    ...(details.role !== "member" && teamFields.length
      ? [{ key: "team", title: details.role === "lead" ? "Team answers" : "My answers", fields: teamFields, answers: team, set: setTeam }]
      : []),
    ...(details.member && memberFields.length ? [{ key: "me", title: "My own answers", fields: memberFields, answers: mine, set: setMine }] : []),
  ];

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const d = await updateMyDetails(token, id, {
        ...(sections.some((s) => s.key === "team") ? { formResponses: team } : {}),
        ...(sections.some((s) => s.key === "me") ? { customFields: mine } : {}),
      });
      setDetails(d);
      setMsg("Saved. The organiser sees the new answers.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <TicketsFrame title="My details">
      <div className="space-y-6">
        <div>
          <Link href={`/console/tickets/${id}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            ← {t.event.title}
          </Link>
          {details.editable ? (
            details.editsUntil && <p className="mt-3 text-sm text-muted-foreground">I can change these until {when(details.editsUntil)}.</p>
          ) : (
            <p className="mt-3 text-sm text-foreground/80">{details.lockedReason || "The organiser isn't taking changes right now."}</p>
          )}
        </div>

        {!sections.length ? (
          <p className="text-muted-foreground">This ticket has no questions I can change.</p>
        ) : (
          <form onSubmit={save} className="space-y-8">
            <fieldset disabled={!details.editable || busy} className="space-y-8 disabled:opacity-60">
              {sections.map((s) => {
                const visible = visibleFieldIds(fields, s.answers);
                return (
                  <section key={s.key} className="space-y-5">
                    {sections.length > 1 && <h2 className="text-sm font-medium text-muted-foreground">{s.title}</h2>}
                    {s.fields
                      .filter((f) => visible.has(f.id))
                      .map((f) => (
                        <Question key={f.id} field={f} value={s.answers[f.id]} onChange={(v) => s.set((a) => ({ ...a, [f.id]: v }))} />
                      ))}
                  </section>
                );
              })}
            </fieldset>
            <p className="text-xs text-muted-foreground">
              Name, email and phone stay as registered.{fields.some((f) => f.type === "FILE") && " Files I uploaded stay as they are."}
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {msg && <p className="text-sm text-foreground/80">{msg}</p>}
            {details.editable && (
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? "Saving…" : "Save changes"}
              </button>
            )}
          </form>
        )}
      </div>
    </TicketsFrame>
  );
}
