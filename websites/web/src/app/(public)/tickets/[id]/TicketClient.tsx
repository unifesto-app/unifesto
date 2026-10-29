"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { DownloadSimple, GoogleLogo, MicrosoftOutlookLogo, WhatsappLogo } from "@unifesto/unicon/react";
import SignIn from "@/components/SignIn";
import { ApiError, resendTicket } from "@/lib/api/registration";
import {
  OPEN_REFUND,
  REPORT_REASONS,
  cancelTicket,
  charged,
  deleteTicket,
  findTicket,
  getCheckins,
  getFeedback,
  getMyDetails,
  getRefunds,
  getWhatsappGroup,
  isOver,
  loadTickets,
  reportTicket,
  requestRefund,
  setWhatsappJoined,
  type Checkin,
  type FeedbackForm,
  type MyDetails,
  type Refund,
  type Ticket,
  type WhatsappGroup,
} from "@/lib/api/tickets";
import { clearSession, useWebSession } from "@/lib/auth";
import { googleCalendarUrl, icsDownloadUrl, outlookCalendarUrl } from "@/lib/calendar";
import { IST } from "@/lib/site";
import { TicketsFrame, when, where } from "../TicketsClient";

const FIELD =
  "w-full rounded-3xl bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
const rupees = (v: string | number | null | undefined) => `₹${(Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
/** The app's quick reasons; one tap fills the text, which stays editable. */
const QUICK_REASONS = ["Can't make it anymore", "Event details changed", "Bought by mistake", "Duplicate ticket"];
/** Reasons the system writes itself say nothing new, so they aren't shown. */
const SYSTEM_REASONS = new Set(["Cancelled by attendee", "Superseded by a new registration attempt"]);

/** The app's ticket page: the pass, and everything I can do with this ticket. */
export default function TicketClient({ id }: { id: string }) {
  const router = useRouter();
  const { session, ready, pending } = useWebSession();
  const token = session?.token ?? "";
  const [t, setT] = useState<Ticket | null | undefined>(undefined);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [wa, setWa] = useState<WhatsappGroup | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [details, setDetails] = useState<MyDetails | null>(null);
  const [feedback, setFeedback] = useState<FeedbackForm | null>(null);
  const [svg, setSvg] = useState("");
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState("");
  const [sure, setSure] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let live = true;
    findTicket(token, id).then(
      (found) => {
        if (!live) return;
        setT(found);
        if (!found) return;
        getCheckins(token, found.id).then((c) => live && setCheckins(c), () => undefined);
        getWhatsappGroup(token, found.id).then((w) => live && setWa(w), () => undefined);
        if (charged(found) > 0 && !found.isGroupMember) getRefunds(token, found.id).then((r) => live && setRefunds(r), () => undefined);
        getMyDetails(token, found.id).then((d) => live && setDetails(d), () => undefined);
        // Feedback is for after the event; it opens when the event starts.
        if (new Date(found.event.startDateTime).getTime() <= Date.now())
          getFeedback(token, found.event.id).then((f) => live && setFeedback(f), () => undefined);
      },
      (e) => {
        if (e instanceof ApiError && e.status === 401) clearSession();
        else if (live) setError(e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [token, id]);

  useEffect(() => {
    if (!t) return;
    QRCode.toString(t.qrCode || t.id, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } }).then(setSvg, () => setSvg(""));
  }, [t]);

  if (!ready) return <TicketsFrame title="My ticket">{null}</TicketsFrame>;
  if (!session)
    return (
      <TicketsFrame title="My ticket">
        <SignIn next={`/tickets/${id}`} pending={pending} intro="Enter the email you registered with. We send you a code to confirm it's you." submitLabel="Show my ticket" />
      </TicketsFrame>
    );
  if (t === undefined)
    return <TicketsFrame title="My ticket">{error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading…</p>}</TicketsFrame>;
  if (t === null)
    return (
      <TicketsFrame title="My ticket">
        <p className="text-paper/75">
          This ticket isn&apos;t on my account.{" "}
          <Link href="/tickets" className="underline">
            My tickets
          </Link>
        </p>
      </TicketsFrame>
    );

  // The app's rules (useTicketDetail).
  const raw = (t.status || "REGISTERED").toUpperCase();
  const cancelled = raw === "CANCELLED";
  // A group pass is one person's: in once *they* were scanned.
  const checkedIn = !cancelled && ((t.groupSize ?? 0) > 1 ? checkins.length > 0 : raw === "ATTENDED" || raw === "CHECKED_IN" || !!t.checkedInAt);
  const ended = !cancelled && isOver(t, now);
  const price = charged(t);
  const free = price === 0;
  const member = !!t.isGroupMember;
  const canRefund = !cancelled && !free && !member;
  const openRefund = refunds.find((r) => OPEN_REFUND.includes(r.status));
  const canAskRefund = canRefund && !openRefund && t.event.status !== "COMPLETED";
  const canCancel = !cancelled && free && !ended && !member;
  const canDelete = (cancelled || ended) && !member;
  const status = cancelled ? "Cancelled" : checkedIn ? (ended ? "Attended" : "Checked in") : ended ? "Ended" : "Registered";
  const code = t.tickets?.[0]?.ticketCode || t.id.slice(0, 8).toUpperCase();
  const reason = t.cancellationReason?.trim();
  const byOrganiser = reason === "Cancelled by the organiser";

  const act = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setError("");
    setMsg("");
    try {
      await fn();
      setSure("");
      if (done) setMsg(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  };
  const reload = async () => {
    await loadTickets(token);
    setT(await findTicket(token, id));
  };

  return (
    <TicketsFrame title={t.event.title}>
      <div className="space-y-8">
        <div>
          <Link href="/tickets" className="text-sm text-paper/65 hover:text-paper hover:underline">
            ← My tickets
          </Link>
          <p className={`mt-3 text-sm font-semibold ${cancelled ? "text-red-400" : checkedIn ? "text-primary" : "text-paper/75"}`}>{status}</p>
          <p className="mt-1 text-paper">
            {when(t.event.startDateTime)} · {where(t.event)}
          </p>
          <p className="mt-1 text-sm text-paper/65">
            {[t.ticketType?.name, free ? "Free" : rupees(price), member ? `Seat in ${t.leadName || "a group"}'s booking` : null].filter(Boolean).join(" · ")}
          </p>
          <Link href={`/event/${t.event.slug}`} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
            View event
          </Link>
        </div>

        {cancelled && (
          <div className="rounded-2xl bg-canvas p-4 text-sm text-paper/80">
            Cancelled{t.cancelledAt && <> on {day(t.cancelledAt)}</>}
            {byOrganiser && " by the organiser"}.
            {reason && !byOrganiser && !SYSTEM_REASONS.has(reason) && <p className="mt-1">Reason: {reason}</p>}
          </div>
        )}

        {!cancelled && (
          <div className="text-center">
            <div className="mx-auto w-52 overflow-hidden rounded-xl bg-white p-2" aria-label="Ticket QR code" role="img">
              {/* The SVG comes from the qrcode encoder, never from the API. */}
              {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
            </div>
            <p className="mt-2 font-mono text-xs text-paper/55">{code}</p>
            {!member && !ended && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act("resend", () => resendTicket(t.id, token).then((r) => setMsg(r.email ? `Sent to ${r.email}.` : "Sent.")))}
                className="mt-3 text-sm text-paper/75 underline hover:text-paper"
              >
                {busy === "resend" ? "Sending…" : "Email me this ticket"}
              </button>
            )}
          </div>
        )}
        {msg && <p className="text-sm text-paper/85">{msg}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!cancelled && !ended && (
          <section>
            <h2 className="text-sm font-medium text-paper/75">Add to calendar</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {(() => {
                const cal = { slug: t.event.slug, title: t.event.title, startIso: t.event.startDateTime, endIso: t.event.endDateTime ?? undefined, location: where(t.event) };
                return (
                  <>
                    <a href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">
                      <GoogleLogo className="h-4 w-4" aria-hidden /> Google
                    </a>
                    <a href={outlookCalendarUrl(cal)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">
                      <MicrosoftOutlookLogo className="h-4 w-4" aria-hidden /> Outlook
                    </a>
                    <a href={icsDownloadUrl(t.event.slug)} className="btn btn-sm btn-secondary">
                      <DownloadSimple className="h-4 w-4" aria-hidden /> Apple / .ics
                    </a>
                  </>
                );
              })()}
            </div>
          </section>
        )}

        {wa?.inviteUrl && !cancelled && (
          <section>
            <h2 className="text-sm font-medium text-paper/75">{wa.isCommunity ? "WhatsApp community" : "WhatsApp group"}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <a href={wa.inviteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">
                <WhatsappLogo className="h-4 w-4" aria-hidden /> Join
              </a>
              <label className="flex items-center gap-2 text-sm text-paper/80">
                <input
                  type="checkbox"
                  checked={wa.joined}
                  disabled={busy === "wa"}
                  onChange={(e) => {
                    const joined = e.target.checked;
                    void act("wa", () => setWhatsappJoined(token, t.id, joined).then(() => setWa({ ...wa, joined })));
                  }}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                I&apos;ve joined
              </label>
            </div>
          </section>
        )}

        {checkins.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-paper/75">Check-ins</h2>
            <ul className="mt-2 space-y-1 text-sm text-paper/80">
              {checkins.map((c) => (
                <li key={c.id}>
                  {when(c.checkedInAt)}
                  {c.checkinType && <> · {c.checkinType}</>}
                  {c.checkedBy && <span className="text-paper/55"> · by {c.checkedBy}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!cancelled && (details?.editable || (feedback?.enabled && (feedback.open || feedback.response))) && (
          <section className="flex flex-wrap gap-3">
            {details?.editable && (
              <Link href={`/tickets/${t.id}/details`} className="btn btn-sm btn-secondary">
                Edit my details
              </Link>
            )}
            {feedback?.enabled && (feedback.open || feedback.response) && (
              <Link href={`/feedback/${t.event.id}`} className="btn btn-sm btn-secondary">
                {feedback.response ? "My feedback" : "Give feedback"}
              </Link>
            )}
          </section>
        )}

        {canRefund && (refunds.length > 0 || canAskRefund) && (
          <RefundSection
            refunds={refunds}
            canAsk={canAskRefund}
            busy={busy === "refund"}
            onAsk={(why) =>
              act("refund", async () => {
                await requestRefund(token, t.id, why);
                setRefunds(await getRefunds(token, t.id));
              })
            }
          />
        )}

        {(canCancel || canDelete) && (
          <section className="space-y-2">
            {canCancel &&
              (sure === "cancel" ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => act("cancel", async () => { await cancelTicket(token, t.id); await reload(); }, "Ticket cancelled.")}
                    className="btn btn-sm btn-secondary"
                  >
                    {busy === "cancel" ? "Cancelling…" : "Yes, cancel my ticket"}
                  </button>
                  <button type="button" onClick={() => setSure("")} className="text-sm text-paper/70 hover:underline">
                    Keep it
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setSure("cancel")} className="text-sm text-paper/75 hover:text-paper hover:underline">
                  Cancel my ticket
                </button>
              ))}
            {canDelete &&
              (sure === "delete" ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => act("delete", async () => { await deleteTicket(token, t.id); router.push("/tickets"); })}
                    className="btn btn-sm btn-secondary"
                  >
                    {busy === "delete" ? "Deleting…" : "Yes, delete it from my list"}
                  </button>
                  <button type="button" onClick={() => setSure("")} className="text-sm text-paper/70 hover:underline">
                    Keep it
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setSure("delete")} className="text-sm text-paper/75 hover:text-paper hover:underline">
                  Delete from my tickets
                </button>
              ))}
          </section>
        )}

        {/* A case about this ticket goes to the organiser's desk. A member's ticket is the lead's registration, so it goes as the event. */}
        <Link
          href={`/account/support/new?${member ? `eventId=${t.event.id}` : `registrationId=${t.id}`}`}
          className="block text-sm text-paper/65 hover:text-paper hover:underline"
        >
          Get help with this ticket
        </Link>
        <Report busy={busy === "report"} onSend={(r, d) => act("report", () => reportTicket(token, t.id, r, d), "Thanks. The Unifesto team will look into it.")} />
      </div>
    </TicketsFrame>
  );
}

/** The app's refund page, inline: each request's progress, and the form while none is open. */
function RefundSection({ refunds, canAsk, busy, onAsk }: { refunds: Refund[]; canAsk: boolean; busy: boolean; onAsk: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim()) onAsk(reason.trim());
  };

  return (
    <section>
      <h2 className="text-sm font-medium text-paper/75">Refund</h2>
      {refunds.map((r) => {
        // A rejection lands at the organiser (no admin action yet) or at the final decision.
        const atOrganiser = r.status === "REJECTED" && !r.adminActionAt;
        const steps = [
          { label: "Request sent", state: "done", at: r.createdAt },
          {
            label: "Organiser review",
            state: r.status === "PENDING_CURATOR" ? "now" : atOrganiser ? "declined" : "done",
            at: r.curatorActionAt,
            note: atOrganiser ? r.curatorNote : null,
          },
          {
            label: "Final decision",
            state:
              r.status === "APPROVED" ? "done" : r.status === "REJECTED" && r.adminActionAt ? "declined" : atOrganiser ? "skipped" : r.status === "PENDING_CURATOR" ? "later" : "now",
            at: r.adminActionAt,
            note: r.status === "REJECTED" && r.adminActionAt ? r.adminNote : null,
          },
        ];
        return (
          <div key={r.id} className="mt-3 rounded-2xl bg-canvas p-4">
            <p className={`text-sm font-semibold ${r.status === "APPROVED" ? "text-primary" : r.status === "REJECTED" ? "text-red-400" : "text-paper"}`}>
              {r.status === "APPROVED" ? `Refund approved: ${rupees(r.approvedAmount ?? r.requestedAmount)}` : r.status === "REJECTED" ? "Refund declined" : "In review"}
            </p>
            <p className="mt-1 text-xs text-paper/60">&ldquo;{r.reason}&rdquo;</p>
            <ol className="mt-3 space-y-2 text-sm">
              {steps.map((s) => (
                <li key={s.label} className={s.state === "later" || s.state === "skipped" ? "text-paper/45" : "text-paper/85"}>
                  <span className={s.state === "declined" ? "text-red-400" : s.state === "now" ? "font-medium text-paper" : ""}>
                    {s.state === "done" ? "✓ " : s.state === "declined" ? "✕ " : s.state === "now" ? "● " : "○ "}
                    {s.label}
                  </span>
                  {s.at && <span className="text-xs text-paper/55"> · {day(s.at)}</span>}
                  {s.note && <p className="ml-5 mt-0.5 text-xs text-paper/70">{s.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {canAsk && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <p className="text-sm text-paper/70">
            Only the ticket price is refunded; booking fees are not. Approved refunds go back to the original payment method in 5 to 7
            business days.
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setReason(q)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${reason === q ? "bg-primary text-ink" : "bg-canvas text-paper/80 hover:text-paper"}`}
              >
                {q}
              </button>
            ))}
          </div>
          <textarea required rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you need a refund?" aria-label="Reason" className={`${FIELD} resize-y`} />
          <button type="submit" disabled={busy || !reason.trim()} className="btn btn-sm btn-primary disabled:opacity-40">
            {busy ? "Sending…" : "Request a refund"}
          </button>
        </form>
      )}
    </section>
  );
}

/** The app's "Report an issue" for a ticket. Reporting again updates the open report. */
function Report({ busy, onSend }: { busy: boolean; onSend: (reason: string, details?: string) => void }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].key);
  const [details, setDetails] = useState("");
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-paper/65 hover:text-paper">Report a problem with this ticket</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend(reason, details.trim() || undefined);
        }}
        className="mt-3 space-y-3"
      >
        <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="What's wrong" className={FIELD}>
          {REPORT_REASONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything that helps (optional)" aria-label="Details" className={`${FIELD} resize-y`} />
        <button type="submit" disabled={busy} className="btn btn-sm btn-secondary">
          {busy ? "Sending…" : "Send report"}
        </button>
      </form>
    </details>
  );
}
