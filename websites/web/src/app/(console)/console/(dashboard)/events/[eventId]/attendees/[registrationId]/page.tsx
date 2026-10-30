"use client";

import { inr } from "@/console/lib/utils/money";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  Phone,
  User,
  Ticket,
  CurrencyInr,
  Clock,
  Copy,
  Check,
  ArrowCounterClockwise,
  Warning,
} from "@unifesto/unicon/react";
import {
  getRegistrationById,
  requestTransfer,
  getMyTransferRequests,
  restoreRegistration,
  cancelRegistrationAsOrganiser,
  releaseGroupSeat,
  reopenGroupSeat,
  removeGroupSeat,
  addGroupSeats,
  makeGroupLead,
  type TransferRequest,
  REGISTRATION_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/console/lib/api/registrations-api";
import type {
  Registration,
  RegistrationStatus,
  PaymentStatus,
} from "@/console/lib/api/registrations-api";
import { getEventById } from "@/console/lib/api/events-api";
import { requestRefundOnBehalf } from "@/console/lib/api/refunds-api";
import { Textarea } from "@/console/components/ui/textarea";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { AnswerValue } from "@/console/components/events/answer-value";
import { formatAnswer } from "@/console/lib/form-questions";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Skeleton } from "@/console/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

function initials(name?: string | null, username?: string | null): string {
  return (name || username || "?").substring(0, 2).toUpperCase();
}

function statusBadgeVariant(status: RegistrationStatus) {
  switch (status) {
    case "ATTENDED":
      return "success" as const;
    case "CANCELLED":
      return "destructive" as const;
    default:
      return "neutral" as const;
  }
}

function paymentBadgeVariant(status: PaymentStatus) {
  switch (status) {
    case "PAID":
      return "success" as const;
    case "FAILED":
    case "PARTIALLY_REFUNDED":
    case "REFUNDED":
      return "destructive" as const;
    default:
      return "neutral" as const;
  }
}

function seatBadgeVariant(status: string) {
  switch (status) {
    case "CLAIMED":
      return "success" as const;
    case "INVITED":
      return "warning" as const;
    default:
      // OPEN and RELEASED both read as inactive here.
      return "neutral" as const;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function money(value: number): string {
  return inr(value);
}

// Group members can arrive in different shapes depending on how/when the
// registration was captured: sometimes `{ name, email, mobile, gender,
// customFields }`, sometimes a flat form-response map keyed by form-field id.
// These helpers normalise both so a member's real details always surface.
const FIELD_ALIASES: Record<"name" | "email" | "mobile" | "gender", string[]> = {
  name: ["name", "full name", "fullname", "attendee name"],
  email: ["email", "e-mail", "email address"],
  mobile: [
    "mobile",
    "phone",
    "mobile number",
    "phone number",
    "contact",
    "contact number",
  ],
  gender: ["gender", "sex"],
};

/** Yes/No as words, picks joined, a file by its name. */
const stringifyValue = formatAnswer;

/** Merge a member's top-level fields with its nested customFields into one map. */
function flattenMember(m: unknown): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  if (m && typeof m === "object") {
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      if (k === "customFields" && v && typeof v === "object") {
        Object.assign(flat, v as Record<string, unknown>);
      } else {
        flat[k] = v;
      }
    }
  }
  return flat;
}

/** Find a well-known field by matching either the raw key or its resolved label. */
function pickField(
  flat: Record<string, unknown>,
  labels: Record<string, string>,
  aliases: string[]
): { key: string; value: string } | null {
  for (const [k, v] of Object.entries(flat)) {
    const value = stringifyValue(v).trim();
    if (!value) continue;
    const candidates = [k.toLowerCase(), (labels[k] ?? "").toLowerCase()];
    if (candidates.some((c) => aliases.includes(c))) return { key: k, value };
  }
  return null;
}

/**
 * Copy-to-clipboard button for opaque identifiers (e.g. the registration UUID),
 * which support agents often need to paste into lookups. Shows a brief "copied"
 * confirmation, then reverts. Falls back silently if the Clipboard API is
 * unavailable (older browsers / non-secure contexts).
 */
function CopyIdButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — leave the value visible for manual copy.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy registration ID"}
      title="Copy registration ID"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" weight="bold" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/** A label/value pair used throughout the detail cards. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

/** One group member, normalised to the fields we render. */
interface GroupMemberView {
  index: number;
  name: string | null;
  email: string | null;
  mobile: string | null;
  gender: string | null;
  /** Per-member extra fields (team-wide ones are hoisted out — see below). */
  extras: { key: string; label: string; value: string; raw: unknown }[];
}

/**
 * Normalise a group's members and split their fields into two buckets:
 *
 *  - `sharedFields`: extras that are present for EVERY member with the same
 *    value (Team Name, College, State…). These are team attributes, not
 *    per-person ones, so we surface them once as a team summary instead of
 *    repeating them on every card — that repetition is what turned a 4-person
 *    group into a wall of duplicated rows.
 *  - each member's remaining `extras`: only what actually differs per person
 *    (e.g. Address).
 */
function buildGroupView(
  members: unknown[],
  labels: Record<string, string>
): { members: GroupMemberView[]; sharedFields: { label: string; value: string }[] } {
  const normalised: GroupMemberView[] = members.map((m, index) => {
    const flat = flattenMember(m);
    const nameF = pickField(flat, labels, FIELD_ALIASES.name);
    const emailF = pickField(flat, labels, FIELD_ALIASES.email);
    const mobileF = pickField(flat, labels, FIELD_ALIASES.mobile);
    const genderF = pickField(flat, labels, FIELD_ALIASES.gender);
    const usedKeys = new Set(
      [nameF, emailF, mobileF, genderF]
        .filter(Boolean)
        .map((f) => (f as { key: string }).key)
    );
    const extras = Object.entries(flat)
      .filter(([k, v]) => !usedKeys.has(k) && stringifyValue(v).trim() !== "")
      .map(([k, v]) => ({ key: k, label: labels[k] ?? k, value: stringifyValue(v), raw: v }));
    return {
      index,
      name: nameF?.value ?? null,
      email: emailF?.value ?? null,
      mobile: mobileF?.value ?? null,
      gender: genderF?.value ?? null,
      extras,
    };
  });

  const sharedFields: { label: string; value: string }[] = [];
  if (normalised.length > 1) {
    const sharedKeys = new Set<string>();
    for (const extra of normalised[0].extras) {
      const sameEverywhere = normalised.every((mem) =>
        mem.extras.some((e) => e.key === extra.key && e.value === extra.value)
      );
      if (sameEverywhere) {
        sharedKeys.add(extra.key);
        sharedFields.push({ label: extra.label, value: extra.value });
      }
    }
    for (const mem of normalised) {
      mem.extras = mem.extras.filter((e) => !sharedKeys.has(e.key));
    }
  }

  return { members: normalised, sharedFields };
}

export default function AttendeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const registrationId = params.registrationId as string;

  const [registration, setRegistration] = useState<Registration | null>(null);
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Restore (un-cancel) flow, gated behind a confirm dialog.
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  // Cancel (free/unpaid) or raise a refund (paid) on the attendee's behalf.
  const [endAction, setEndAction] = useState<"cancel" | "refund" | null>(null);
  const [endReason, setEndReason] = useState("");
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState("");
  const [endNotice, setEndNotice] = useState("");

  // Per-seat release/reopen: track which seat is mid-request + any error.
  const [seatMutating, setSeatMutating] = useState<number | null>(null);
  const [seatError, setSeatError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [regResult, eventResult] = await Promise.all([
      getRegistrationById(eventId, registrationId),
      getEventById(eventId),
    ]);
    if (regResult.error) setError(regResult.error.message);
    else setRegistration(regResult.data);
    // Build an id → label map so form responses show the field name (e.g.
    // "School of Engineering") instead of the raw field UUID.
    setFieldLabels(
      Object.fromEntries(
        (eventResult.data?.formFields ?? []).map((f) => [f.id, f.label])
      )
    );
    setLoading(false);
  }, [eventId, registrationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backToList = () =>
    router.push(`/console/events/${eventId}/attendees`);

  const handleRestore = async () => {
    setRestoring(true);
    setRestoreError("");
    const { data, error } = await restoreRegistration(eventId, registrationId);
    if (error) {
      setRestoreError(error.message || "Could not restore this registration.");
      setRestoring(false);
      return;
    }
    if (data) setRegistration(data);
    setRestoring(false);
    setRestoreOpen(false);
  };

  const handleEnd = async () => {
    if (!endAction) return;
    if (endAction === "refund" && !endReason.trim()) {
      setEndError("Say why, so Unifesto can approve it.");
      return;
    }
    setEnding(true);
    setEndError("");
    const { error } =
      endAction === "cancel"
        ? await cancelRegistrationAsOrganiser(eventId, registrationId, endReason.trim() || undefined)
        : await requestRefundOnBehalf(registrationId, endReason.trim());
    setEnding(false);
    if (error) {
      setEndError(error.message);
      return;
    }
    setEndNotice(
      endAction === "cancel"
        ? "Cancelled. The attendee has been emailed."
        : "Refund raised. Unifesto reviews it and sends the ticket price back; track it under Refunds."
    );
    setEndAction(null);
    setEndReason("");
    await load();
  };

  // Retire an unfilled seat (OPEN/INVITED → RELEASED) or bring one back
  // (RELEASED → OPEN), then refetch so the seat list reflects the new state.
  const mutateSeat = async (
    seatIndex: number,
    action: "release" | "reopen" | "remove" | "make-lead" | "add"
  ) => {
    const ask: Partial<Record<typeof action, string>> = {
      remove:
        "Remove this seat from the group? The group gets one smaller and the seat goes back on sale. Nothing is refunded. A member who is removed loses their ticket and is told by email.",
      "make-lead":
        "Make this member the group lead? They manage the group and its booking from now on, including refunds. The current lead becomes a member.",
      add: "Add a seat to this group? The lead can invite someone into it. Nothing is charged in the app; collect any payment yourself.",
    };
    if (ask[action] && !window.confirm(ask[action])) return;
    setSeatMutating(seatIndex);
    setSeatError("");
    const { error } =
      action === "release"
        ? await releaseGroupSeat(eventId, registrationId, seatIndex)
        : action === "reopen"
        ? await reopenGroupSeat(eventId, registrationId, seatIndex)
        : action === "remove"
        ? await removeGroupSeat(eventId, registrationId, seatIndex)
        : action === "make-lead"
        ? await makeGroupLead(eventId, registrationId, seatIndex)
        : await addGroupSeats(eventId, registrationId, 1);
    if (error) {
      setSeatError(error.message || "Could not update that seat.");
      setSeatMutating(null);
      return;
    }
    await load();
    setSeatMutating(null);
  };

  const formEntries = registration?.formResponses
    ? Object.entries(registration.formResponses)
    : [];

  const groupSeats = registration?.groupSeats ?? [];
  // A group is defined by its size; GroupSeat rows are its roster.
  const isGroup = (registration?.groupSize ?? 0) > 1;
  // Each member's filled details live on the seat (`memberDetails`); the
  // normaliser hoists team-wide answers (Team Name, College…) to a shared
  // summary, and each seat keeps only what differs per person (gender, GitHub…).
  // Positional: seat i (ordered by seatIndex) aligns with member view i.
  const seatView = buildGroupView(
    groupSeats.map((s) => s.memberDetails ?? {}),
    fieldLabels
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={backToList} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to attendees
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !registration ? (
        !error && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm font-medium">Attendee not found</p>
            </CardContent>
          </Card>
        )
      ) : (
        <>
          <PageHeader
            title={
              registration.user.fullName ||
              registration.user.username ||
              "Attendee"
            }
            subtitle={
              registration.user.email ||
              registration.user.username ||
              undefined
            }
            actions={
              <div className="flex items-center gap-2">
                <Badge variant={statusBadgeVariant(registration.status)}>
                  {REGISTRATION_STATUS_LABEL[registration.status] ?? registration.status}
                </Badge>
                <Badge variant={paymentBadgeVariant(registration.paymentStatus)}>
                  {PAYMENT_STATUS_LABEL[registration.paymentStatus] ?? registration.paymentStatus}
                </Badge>
                {registration.status !== "CANCELLED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEndError("");
                      setEndNotice("");
                      setEndAction(isPaidBooking(registration.paymentStatus) ? "refund" : "cancel");
                    }}
                  >
                    {isPaidBooking(registration.paymentStatus) ? "Raise refund" : "Cancel registration"}
                  </Button>
                )}
                {registration.status === "CANCELLED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRestoreError("");
                      setRestoreOpen(true);
                    }}
                  >
                    <ArrowCounterClockwise className="h-4 w-4" />
                    Restore
                  </Button>
                )}
              </div>
            }
          />

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-muted text-lg font-medium">
              {registration.user.avatarUrl ? (
                <img
                  src={registration.user.avatarUrl}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                initials(
                  registration.user.fullName,
                  registration.user.username
                )
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold">
                {registration.user.fullName ||
                  registration.user.username ||
                  "Unknown"}
              </p>
              {registration.checkedInAt && (
                <div className="mt-1 flex items-center gap-1 text-sm text-success">
                  <CheckCircle className="h-4 w-4" weight="fill" />
                  Checked in {formatDateTime(registration.checkedInAt)}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4" />
                  Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <Field label="Full name">
                  {registration.user.fullName || "—"}
                </Field>
                <Field label="Username">
                  {registration.user.username || "—"}
                </Field>
                <Field label="Email">
                  {registration.user.email ? (
                    <a
                      href={`mailto:${registration.user.email}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <EnvelopeSimple className="h-3.5 w-3.5" />
                      {registration.user.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field label="Mobile">
                  {registration.user.mobileNumber ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {registration.user.mobileNumber}
                    </span>
                  ) : (
                    "—"
                  )}
                </Field>
              </CardContent>
            </Card>

            {/* Registration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ticket className="h-4 w-4" />
                  Registration
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <Field label="Registration ID">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-xs">{registration.id}</span>
                    <CopyIdButton value={registration.id} />
                  </span>
                </Field>
                <Field label="Ticket type">
                  {registration.ticketType?.name || "RSVP"}
                </Field>
                {registration.groupSize && registration.groupSize > 1 ? (
                  <Field label="Group size">
                    {registration.groupSize} people
                  </Field>
                ) : (
                  <Field label="Quantity">{registration.quantity}</Field>
                )}
                <Field label="Status">
                  <Badge variant={statusBadgeVariant(registration.status)}>
                    {REGISTRATION_STATUS_LABEL[registration.status] ?? registration.status}
                  </Badge>
                </Field>
                {registration.isWaitlisted && (
                  <Field label="Waitlisted">Yes</Field>
                )}
                <Field label="Registered">
                  {formatDateTime(registration.registeredAt)}
                </Field>
                {registration.cancelledAt && (
                  <Field label="Cancelled">
                    {formatDateTime(registration.cancelledAt)}
                  </Field>
                )}
                {registration.status === "CANCELLED" &&
                  registration.cancellationReason && (
                    <Field label="Cancellation reason">
                      {registration.cancellationReason}
                    </Field>
                  )}
                <Field label="WhatsApp group">
                  {registration.whatsappGroupJoinedAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge variant="success">Joined</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(registration.whatsappGroupJoinedAt)}
                      </span>
                    </span>
                  ) : registration.whatsappInviteSentAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge variant="neutral">Invited</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(registration.whatsappInviteSentAt)}
                      </span>
                    </span>
                  ) : (
                    <Badge variant="neutral">Not invited</Badge>
                  )}
                </Field>
              </CardContent>
            </Card>

            {/* Payment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CurrencyInr className="h-4 w-4" />
                  Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <Field label="Payment status">
                  <Badge
                    variant={paymentBadgeVariant(registration.paymentStatus)}
                  >
                    {PAYMENT_STATUS_LABEL[registration.paymentStatus] ?? registration.paymentStatus}
                  </Badge>
                </Field>
                <Field label="Total amount">
                  {money(registration.totalAmount)}
                </Field>
                {registration.processingFee > 0 && (
                  <Field label="Processing fee">
                    {money(registration.processingFee)}
                  </Field>
                )}
                {registration.paidAt && (
                  <Field label="Paid at">
                    {formatDateTime(registration.paidAt)}
                  </Field>
                )}
                {registration.paymentId && (
                  <Field label="Payment ID">
                    <span className="font-mono text-xs">
                      {registration.paymentId}
                    </span>
                  </Field>
                )}
                {registration.orderId && (
                  <Field label="Order ID">
                    <span className="font-mono text-xs">
                      {registration.orderId}
                    </span>
                  </Field>
                )}
              </CardContent>
            </Card>

            {/* Check-in history */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4" />
                  Check-in history
                </CardTitle>
              </CardHeader>
              <CardContent>
                {registration.checkinRecords &&
                registration.checkinRecords.length > 0 ? (
                  <div className="divide-y">
                    {registration.checkinRecords.map((rec, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle
                            className="h-4 w-4 text-success"
                            weight="fill"
                          />
                          <span className="text-sm font-medium">
                            {rec.checkinType?.name || "Check-in"}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">
                            {formatDateTime(rec.checkedInAt)}
                          </p>
                          {rec.checkedInByUser && (
                            <p className="text-xs text-muted-foreground">
                              by{" "}
                              {rec.checkedInByUser.fullName ||
                                rec.checkedInByUser.username}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : registration.checkedInAt ? (
                  <p className="py-2 text-sm">
                    Checked in {formatDateTime(registration.checkedInAt)}
                  </p>
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">
                    Not checked in yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Group seats — pay-first invite/claim state (fast-registration
              Part 2). Shows which of the N paid seats are OPEN (unfilled),
              INVITED (email sent, awaiting claim) or CLAIMED (a member confirmed
              and got their own ticket). Only the lead can send invites; the
              organiser can release/reopen, remove or add seats, and make a
              member the lead. */}
          {groupSeats.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ticket className="h-4 w-4" />
                  Group seats ({groupSeats.filter((s) => s.status === "CLAIMED").length}/
                  {groupSeats.filter((s) => s.status !== "RELEASED").length} claimed
                  {groupSeats.some((s) => s.status === "RELEASED") &&
                    `, ${groupSeats.filter((s) => s.status === "RELEASED").length} released`}
                  )
                </CardTitle>
                {registration.status !== "CANCELLED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={seatMutating === 0}
                    onClick={() => mutateSeat(0, "add")}
                  >
                    {seatMutating === 0 ? "Adding…" : "Add seat"}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {seatError && <ErrorNotice message={seatError} />}
                {/* Team-wide answers (same for everyone) shown once, so each
                    seat below only carries what's actually that member's. */}
                {seatView.sharedFields.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Team details
                    </p>
                    <div className="flex flex-wrap gap-x-8 gap-y-2">
                      {seatView.sharedFields.map((f, j) => (
                        <div key={j} className="flex flex-col">
                          <span className="text-[11px] text-muted-foreground">
                            {f.label}
                          </span>
                          <span className="text-sm font-medium">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {groupSeats.map((seat, idx) => {
                  const claimer = seat.claimedBy;
                  const md = (seat.memberDetails ?? {}) as Record<string, unknown>;
                  // Normalised per-member fields (gender + extras like GitHub),
                  // aligned positionally with the seat order above.
                  const mem = seatView.members[idx];
                  const name =
                    claimer?.fullName ||
                    claimer?.username ||
                    (typeof md.name === "string" ? md.name : "") ||
                    null;
                  const email =
                    claimer?.email ||
                    (typeof md.email === "string" ? md.email : "") ||
                    seat.inviteEmail ||
                    null;
                  // Seat 1 is the lead — its WhatsApp state lives on the
                  // registration row; members track it on the seat.
                  const waInvited =
                    seat.seatIndex === 1
                      ? !!registration.whatsappInviteSentAt ||
                        !!registration.whatsappGroupJoinedAt
                      : !!seat.whatsappInviteSentAt;
                  const mobile = mem?.mobile || null;
                  const gender = mem?.gender || null;
                  const extras = mem?.extras ?? [];
                  const hasDetails = !!(mobile || gender || extras.length > 0);
                  const isReleased = seat.status === "RELEASED";
                  // Only an unfilled seat can be retired; a CLAIMED seat (incl.
                  // the lead's seat 1) changes hands via ticket transfer, not here.
                  // Frozen once the registration is cancelled.
                  const canRelease =
                    (seat.status === "OPEN" || seat.status === "INVITED") &&
                    registration.status !== "CANCELLED";
                  const busy = seatMutating === seat.seatIndex;
                  // Any seat but the lead's can leave the group; a member who
                  // claimed with their own account can take over as lead.
                  const canChange =
                    seat.seatIndex !== 1 && registration.status !== "CANCELLED";
                  const canLead =
                    canChange && seat.status === "CLAIMED" && !!seat.claimedBy;
                  return (
                    <div
                      key={seat.seatIndex}
                      className={`rounded-lg border p-3 ${
                        isReleased
                          ? "border-dashed border-border/60 bg-muted/30"
                          : "border-border"
                      }`}
                    >
                      {/* Phone: actions drop below the name so it isn't squeezed out. */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {seat.seatIndex}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">
                                {name ||
                                  (isReleased
                                    ? "Released seat"
                                    : seat.status === "OPEN"
                                    ? "Unfilled seat"
                                    : "Awaiting claim")}
                              </p>
                              {gender && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                                  {gender}
                                </span>
                              )}
                            </div>
                            {email && (
                              <p className="truncate text-xs text-muted-foreground">
                                {email}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-wrap items-center gap-x-1 gap-y-2 sm:gap-2">
                          {seat.claimedAt && (
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                              {formatDateTime(seat.claimedAt)}
                            </span>
                          )}
                          {seat.status !== "OPEN" &&
                            !isReleased &&
                            (waInvited ? (
                              <Badge variant="success" className="hidden sm:inline-flex">
                                WhatsApp sent
                              </Badge>
                            ) : (
                              <span className="hidden text-xs text-muted-foreground sm:inline">
                                No WhatsApp
                              </span>
                            ))}
                          <Badge variant={seatBadgeVariant(seat.status)}>
                            {seat.seatIndex === 1 && seat.status === "CLAIMED"
                              ? "Lead"
                              : seat.status.charAt(0) +
                                seat.status.slice(1).toLowerCase()}
                          </Badge>
                          {canRelease && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => mutateSeat(seat.seatIndex, "release")}
                            >
                              {busy ? "Releasing…" : "Release"}
                            </Button>
                          )}
                          {isReleased && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => mutateSeat(seat.seatIndex, "reopen")}
                            >
                              <ArrowCounterClockwise className="h-4 w-4" />
                              {busy ? "Reopening…" : "Reopen"}
                            </Button>
                          )}
                          {canLead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => mutateSeat(seat.seatIndex, "make-lead")}
                            >
                              Make lead
                            </Button>
                          )}
                          {canChange && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => mutateSeat(seat.seatIndex, "remove")}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* The member's own filled fields: phone + any per-person
                          answers (GitHub, etc.). Team-wide answers are hoisted to
                          the summary above, so this only shows what's theirs. */}
                      {hasDetails && (
                        <div className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-2 pl-11 sm:grid-cols-2">
                          {mobile && (
                            <div className="flex flex-col">
                              <span className="text-[11px] text-muted-foreground">
                                Mobile
                              </span>
                              <a
                                href={`tel:${mobile}`}
                                className="text-sm hover:underline"
                              >
                                {mobile}
                              </a>
                            </div>
                          )}
                          {extras.map((e, j) => (
                            <div key={j} className="flex flex-col">
                              <span className="text-[11px] text-muted-foreground">
                                {e.label}
                              </span>
                              <span className="text-sm">
                                <AnswerValue eventId={eventId} value={e.raw} />
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Form responses. For a group these are the lead's answers (the
              registering user); per-member answers live in the card above. */}
          {formEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isGroup ? "Form responses (lead)" : "Form responses"}
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {formEntries.map(([key, value]) => (
                  <Field key={key} label={fieldLabels[key] ?? key}>
                    <AnswerValue eventId={eventId} value={value} />
                  </Field>
                ))}
              </CardContent>
            </Card>
          )}

          <TransferRequestCard
            eventId={eventId}
            registrationId={registrationId}
          />

          {endNotice && <p className="text-sm text-success">{endNotice}</p>}

          <Dialog open={endAction !== null} onOpenChange={(o) => !o && setEndAction(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{endAction === "refund" ? "Raise a refund?" : "Cancel this registration?"}</DialogTitle>
                <DialogDescription>
                  {endAction === "refund"
                    ? "Goes straight to Unifesto for approval. The ticket price comes back to the attendee; the processing fee is kept. The registration is cancelled when the refund goes out."
                    : "Their seat frees up and their ticket stops working. They get an email with your reason."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="end-reason">{endAction === "refund" ? "Reason" : "Reason (optional)"}</Label>
                <Textarea
                  id="end-reason"
                  rows={3}
                  value={endReason}
                  onChange={(e) => setEndReason(e.target.value)}
                  maxLength={1000}
                />
              </div>
              {endError && <ErrorNotice message={endError} />}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEndAction(null)} disabled={ending}>
                  Keep it
                </Button>
                <Button variant="destructive" onClick={handleEnd} disabled={ending}>
                  {ending ? "Working…" : endAction === "refund" ? "Raise refund" : "Cancel registration"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Restore this registration?</DialogTitle>
                <DialogDescription>
                  The attendee moves back to <strong>Registered</strong>: their
                  seat is taken again and their ticket is re-activated. This does
                  not change any payment or refund — no money is moved.
                </DialogDescription>
              </DialogHeader>

              {(registration.paymentStatus === "REFUNDED" ||
                registration.paymentStatus === "PARTIALLY_REFUNDED") && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
                  <Warning className="mt-0.5 h-4 w-4 flex-shrink-0" weight="fill" />
                  <span>
                    This registration was already refunded. Restoring it gives
                    the attendee a ticket without re-collecting payment.
                  </span>
                </div>
              )}

              {restoreError && <ErrorNotice message={restoreError} />}

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setRestoreOpen(false)}
                  disabled={restoring}
                >
                  Cancel
                </Button>
                <Button onClick={handleRestore} disabled={restoring}>
                  {restoring ? "Restoring…" : "Restore registration"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

/**
 * Organiser action: REQUEST a transfer of this registration to another account.
 * Organisers can't move tickets themselves — an admin reviews the request and
 * performs (or declines) the transfer. Shows the current request's status.
 */
function TransferRequestCard({
  eventId,
  registrationId,
}: {
  eventId: string;
  registrationId: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState<TransferRequest | null>(null);

  const loadRequest = useCallback(async () => {
    const { data } = await getMyTransferRequests();
    const mine =
      (data ?? []).find((r) => r.registration?.id === registrationId) ?? null;
    setRequest(mine);
  }, [registrationId]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  const status = request?.status ?? null;

  const submit = async () => {
    setBusy(true);
    setError("");
    const { error } = await requestTransfer(
      eventId,
      registrationId,
      email.trim()
    );
    if (error) {
      setError(error.message || "Could not send the request.");
      setBusy(false);
      return;
    }
    setEmail("");
    setBusy(false);
    await loadRequest();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Transfer registration
          {status && (
            <Badge
              variant={
                status === "APPROVED"
                  ? "success"
                  : status === "REJECTED"
                    ? "destructive"
                    : "warning"
              }
            >
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ask an admin to move this ticket to another Unifesto account. The same
          ticket, QR code, payment and group members stay attached — only the
          holder changes.
        </p>
        {error && <ErrorNotice message={error} />}

        {status === "PENDING" ? (
          <p className="text-sm text-muted-foreground">
            Requested transfer to{" "}
            <span className="font-medium text-foreground">
              {request?.targetEmail}
            </span>{" "}
            — awaiting admin review.
          </p>
        ) : (
          <>
            {status === "APPROVED" && (
              <p className="text-sm text-foreground">
                Last transfer to {request?.targetEmail} was approved.
              </p>
            )}
            {status === "REJECTED" && request?.reviewNote && (
              <p className="text-sm italic text-muted-foreground">
                Previous request declined: {request.reviewNote}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="transfer-email">New holder&rsquo;s email</Label>
              <Input
                id="transfer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="off"
              />
            </div>
            <Button
              variant="outline"
              disabled={busy || !email.trim()}
              onClick={submit}
            >
              {busy ? "Sending…" : "Request transfer"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Money was taken and not fully returned: ending it means a refund, not a cancel. */
function isPaidBooking(p: PaymentStatus): boolean {
  return p === "PAID" || p === "PARTIALLY_REFUNDED";
}
