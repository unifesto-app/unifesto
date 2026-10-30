"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarBlank, CheckCircle, CurrencyInr, Phone, SignIn, SignOut, Warning, XCircle } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Card } from "@/console/components/ui/card";
import { Input } from "@/console/components/ui/input";
import { Textarea } from "@/console/components/ui/textarea";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { AnswerValue } from "@/console/components/events/answer-value";
import { Field, FormCard, HackPage as Page, Notice, Toggle } from "@/console/components/hackathon/HackParts";
import { isFileAnswer } from "@/console/lib/form-questions";
import type { Result } from "@/console/lib/api/call";
import {
  approveStayBooking,
  cancelStayBooking,
  checkInStay,
  checkOutStay,
  getStayBooking,
  GUEST_GENDER_LABELS,
  markStayPaid,
  PAYMENT_LABELS,
  rangeLabel,
  rejectStayBooking,
  rupees,
  STATUS_LABELS,
  staysBase,
  updateStayBooking,
  type TeamStayBooking,
} from "@/console/lib/api/stays";
import { useAccess } from "@/console/lib/context/SessionContext";
import { cn } from "@/console/lib/utils/cn";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/** A highlighted line for the booking's state. */
function Banner({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="flex items-center gap-3 p-4 text-sm text-foreground">
      {icon}
      <span>{children}</span>
    </Card>
  );
}

/**
 * One stay booking for the event team (port of StayBookingDetailScreen): the
 * guests (with IDs), answers, and the next step: approve and assign a room,
 * take payment at the property, check in and out, or cancel. Crew (desk mode)
 * take payment and check guests in and out only.
 */
export default function StayBookingPage() {
  const { eventId, bookingId } = useParams() as { eventId: string; bookingId: string };
  const { can } = useAccess(eventId);
  const desk = !can("event:manage-attendees");
  const [b, setB] = useState<TeamStayBooking | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [allocation, setAllocation] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(true);
  const base = staysBase(eventId);

  const take = useCallback((data: TeamStayBooking) => {
    setB(data);
    setAllocation(data.allocation ?? "");
    setStaffNote(data.staffNote ?? "");
  }, []);

  useEffect(() => {
    void getStayBooking(eventId, bookingId).then((res) =>
      res.ok ? take(res.data) : setError(res.denied ? "You can't open this booking." : res.message)
    );
  }, [eventId, bookingId, take]);

  const back = { href: desk ? base : `${base}/bookings`, label: desk ? "Stay" : "Requests and guests" };
  if (!b) return <Page eventId={eventId} back={back} title="Stay booking" error={error} ready={false} />;

  const run = async (key: string, fn: () => Promise<Result<TeamStayBooking>>, done?: string) => {
    setBusy(key);
    setError("");
    setNotice("");
    const res = await fn();
    setBusy(null);
    if (!res.ok) return setError(res.message);
    take(res.data);
    setReason("");
    if (done) setNotice(done);
  };

  const paidOnline = b.paymentMode === "ONLINE" && b.paymentStatus === "PAID";
  const unpaidAtProperty = b.paymentMode === "PAY_AT_PROPERTY" && b.paymentStatus !== "PAID";
  const notesDirty = allocation !== (b.allocation ?? "") || staffNote !== (b.staffNote ?? "");
  const openStatus = b.status === "PENDING" || b.status === "AWAITING_PAYMENT" || b.status === "CONFIRMED";
  const booker = b.guests.find((g) => g.isBooker) ?? b.guests[0];
  const answered = b.questions.filter((q) => q.type !== "SECTION" && b.answers[q.id] !== undefined && b.answers[q.id] !== "");
  const tone =
    b.status === "PENDING" || b.status === "AWAITING_PAYMENT"
      ? "text-warning"
      : b.status === "REJECTED" || b.status === "CANCELLED" || b.status === "EXPIRED"
        ? "text-destructive"
        : "text-success";
  const r = reason.trim() || undefined;

  const decline = () => {
    if (window.confirm("Decline this request? The guest is told, with your reason if you wrote one.")) {
      void run("reject", () => rejectStayBooking(eventId, b.id, r));
    }
  };

  const cancel = () => {
    const msg = paidOnline
      ? refund
        ? `Cancel this stay and refund ${rupees(b.totalAmount - b.processingFee)}? The processing fee is kept.`
        : `Cancel this stay without a refund? They paid ${rupees(b.totalAmount)} online.`
      : "Cancel this stay? The bed is released and the guest is told.";
    if (window.confirm(msg)) {
      void run("cancel", () => cancelStayBooking(eventId, b.id, paidOnline ? { reason: r, refund } : { reason: r }));
    }
  };

  return (
    <Page
      eventId={eventId}
      back={back}
      title={`${booker?.name || b.user.fullName || "Guest"}${b.guestCount > 1 ? ` +${b.guestCount - 1}` : ""}`}
      subtitle={
        <>
          <span className={cn("mr-2", tone)}>{STATUS_LABELS[b.status]}</span>
          {b.stay.name} · {b.option.name} · {rangeLabel(b.checkInDate, b.checkOutDate, b.nights)} · Pass {b.passCode}
        </>
      }
      error={error}
      ready
    >
      <Notice message={notice} />

      {/* ── Next step ── */}
      {b.status === "PENDING" && desk ? (
        <Banner icon={<Warning className="h-5 w-5 text-warning" />}>Not approved yet. Ask an organiser to approve it first.</Banner>
      ) : b.status === "PENDING" ? (
        <Card className="space-y-2 p-4">
          <Button onClick={() => void run("approve", () => approveStayBooking(eventId, b.id, allocation.trim() || undefined))} disabled={!!busy}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {b.paymentMode === "ONLINE" && b.totalAmount
              ? `They'll have to pay ${rupees(b.totalAmount)} in the app to confirm. Add the room below first if you know it.`
              : "Confirms the stay and sends their Stay Pass. Add the room below first if you know it."}
          </p>
        </Card>
      ) : b.status === "AWAITING_PAYMENT" ? (
        <Banner icon={<CurrencyInr className="h-5 w-5 text-warning" />}>
          Waiting for {rupees(b.totalAmount)}
          {b.paymentDueAt ? ` until ${when(b.paymentDueAt)}` : ""}. The bed is held.
        </Banner>
      ) : b.status === "CONFIRMED" ? (
        <Card className="flex flex-wrap items-center gap-4 p-4">
          {unpaidAtProperty && (
            <Button variant="outline" onClick={() => void run("paid", () => markStayPaid(eventId, b.id))} disabled={!!busy}>
              <CurrencyInr className="h-4 w-4" /> Mark {rupees(b.totalAmount)} collected
            </Button>
          )}
          <Button onClick={() => void run("in", () => checkInStay(eventId, b.id), "Checked in.")} disabled={!!busy || unpaidAtProperty}>
            <SignIn className="h-4 w-4" /> {busy === "in" ? "Checking in…" : "Check in"}
          </Button>
          {unpaidAtProperty && <p className="text-xs text-muted-foreground">Collect the payment first.</p>}
        </Card>
      ) : b.status === "CHECKED_IN" ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle className="h-5 w-5 text-success" weight="fill" /> Checked in {b.checkedInAt ? when(b.checkedInAt) : ""}
          </span>
          <Button variant="outline" onClick={() => void run("out", () => checkOutStay(eventId, b.id), "Checked out.")} disabled={!!busy}>
            <SignOut className="h-4 w-4" /> Check out
          </Button>
        </Card>
      ) : (
        <Banner icon={<Warning className="h-5 w-5 text-destructive" />}>{b.rejectionReason || b.cancellationReason || STATUS_LABELS[b.status]}</Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {/* ── Room & notes ── */}
          {desk ? (
            <ListGroup title="Room">
              <ListRow label={b.allocation || "Not assigned yet"} />
              {b.staffNote && <ListRow label={b.staffNote} />}
            </ListGroup>
          ) : (
            <FormCard title="Room">
              <Field label="Room / bed (the guest sees this)">
                <Input value={allocation} placeholder="Block B, Room 204" onChange={(e) => setAllocation(e.target.value)} />
              </Field>
              <Field label="Team note (only your team sees this)">
                <Textarea value={staffNote} onChange={(e) => setStaffNote(e.target.value)} />
              </Field>
              {notesDirty && (
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    void run("notes", () => updateStayBooking(eventId, b.id, { allocation: allocation.trim() || null, staffNote: staffNote.trim() || null }), "Saved.")
                  }
                >
                  Save room and note
                </Button>
              )}
            </FormCard>
          )}

          {/* ── Guests ── */}
          <ListGroup title={`Guests (${b.guestCount})`}>
            {b.guests.map((g) => (
              <div key={g.id ?? g.name} className="space-y-1 px-4 py-3">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground">{g.isBooker ? `${g.name} (booked)` : g.name}</span>
                  <span className="text-muted-foreground">{GUEST_GENDER_LABELS[g.gender]}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {g.phone ? (
                    <a href={`tel:${g.phone}`} className="underline">
                      {g.phone}
                    </a>
                  ) : null}
                  {g.phone && g.email ? " · " : ""}
                  {g.email}
                  {!g.phone && !g.email && "No contact given"}
                </p>
                {g.idProof && !desk && (
                  <p className="text-xs">
                    ID: <AnswerValue eventId={eventId} value={g.idProof} />
                  </p>
                )}
              </div>
            ))}
          </ListGroup>

          <ListGroup title="Arrival and emergency">
            <ListRow icon={<CalendarBlank className="h-5 w-5" />} label="Arriving" value={b.arrivalAt ? when(b.arrivalAt) : "Not given"} />
            {b.emergencyPhone && (
              <a href={`tel:${b.emergencyPhone}`} className="block">
                <ListRow icon={<Phone className="h-5 w-5" />} label={b.emergencyName || "Emergency contact"} value={b.emergencyPhone} />
              </a>
            )}
          </ListGroup>
        </div>

        <div className="space-y-4">
          {b.note && (
            <FormCard title="Their note">
              <p className="whitespace-pre-line text-sm text-muted-foreground">{b.note}</p>
            </FormCard>
          )}

          {answered.length > 0 && (
            <ListGroup title="Answers">
              {answered.map((q) => (
                <div key={q.id} className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">{q.label}</p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {desk && isFileAnswer(b.answers[q.id]) ? "File attached" : <AnswerValue eventId={eventId} value={b.answers[q.id]} />}
                  </p>
                </div>
              ))}
            </ListGroup>
          )}

          <ListGroup title="Payment">
            <ListRow label={b.totalAmount ? PAYMENT_LABELS[b.paymentMode] : "Free"} value={b.totalAmount ? rupees(b.totalAmount) : undefined} />
            {b.processingFee ? <ListRow label="Includes processing fee" value={rupees(b.processingFee)} /> : null}
            {b.totalAmount ? (
              <ListRow
                label="Status"
                value={b.paymentStatus === "PAID" ? `Paid${b.paidAt ? ` ${when(b.paidAt)}` : ""}` : b.paymentStatus === "REFUNDED" ? "Refunded" : "Not paid"}
              />
            ) : null}
            {b.refundedAmount ? <ListRow label="Refunded" value={rupees(b.refundedAmount)} /> : null}
          </ListGroup>

          {/* ── Decline / cancel ── */}
          {openStatus && !desk && (
            <FormCard title={b.status === "PENDING" ? "Decline" : "Cancel"}>
              <Field label="Reason for the guest (optional)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              {b.status === "CONFIRMED" && paidOnline && (
                <Toggle
                  label={`Refund ${rupees(b.totalAmount - b.processingFee)}`}
                  hint="They paid online. The processing fee is kept."
                  checked={refund}
                  onChange={setRefund}
                />
              )}
              <Button variant="outline" className="text-destructive" disabled={!!busy} onClick={b.status === "CONFIRMED" ? cancel : decline}>
                <XCircle className="h-4 w-4" /> {b.status === "CONFIRMED" ? "Cancel stay" : "Decline request"}
              </Button>
            </FormCard>
          )}
        </div>
      </div>
    </Page>
  );
}
