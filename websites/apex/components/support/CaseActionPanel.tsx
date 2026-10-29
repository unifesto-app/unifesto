"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import type { ApiError } from "@/lib/api/backend-client";
import type { CaseSubject } from "@/lib/api/support-api";
import { adminDecideRefund } from "@/lib/api/refunds-api";
import {
  approveEventRequest,
  approveSpaceRequest,
  rejectEventRequest,
  rejectSpaceRequest,
  reviewStatusRequest,
  reviewSubSpaceRequest,
} from "@/lib/api/requests-api";
import { reviewOwnershipRequest } from "@/lib/api/spaces-api";
import { reviewWhiteLabelRequest } from "@/lib/api/white-label-api";
import { reviewFreeAddRequest } from "@/lib/api/free-add-api";
import { reviewTransferRequest } from "@/lib/api/registrations-api";
import { updateContentReport } from "@/lib/api/content-reports-api";
import { cancelPayout, markPayoutPaid, updateBankAccountStatus } from "@/lib/api/payouts-api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- subject records are untyped JSON of many models
type Run = (id: string, note: string, d: Record<string, any>) => Promise<{ error: ApiError | null }>;

interface Action {
  label: string;
  destructive?: boolean;
  /** The note box must be filled for this action. */
  needsNote?: boolean;
  /** Shown only while the record is in one of these statuses. */
  when: string[];
  run: Run;
}

interface SubjectDef {
  title: string;
  /** The old queue page, until the inbox replaces it. None for kinds born in the inbox. */
  href?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as Run
  fields: (d: Record<string, any>) => [string, ReactNode][];
  actions: Action[];
}

const rupees = (v: unknown) => (v == null ? null : `₹${Number(v).toLocaleString("en-IN")}`);
const note = (n: string) => n.trim() || undefined;
const when = (v: unknown) =>
  new Date(String(v)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/** The usual approve / reject pair on a `PATCH …/review` endpoint. */
function review(fn: (id: string, status: "APPROVED" | "REJECTED", note?: string) => Promise<{ error: ApiError | null }>): Action[] {
  return [
    { label: "Approve", when: ["PENDING"], run: (id, n) => fn(id, "APPROVED", note(n)) },
    { label: "Reject", destructive: true, needsNote: true, when: ["PENDING"], run: (id, n) => fn(id, "REJECTED", note(n)) },
  ];
}

/**
 * One panel per typed record a case can wrap. Each action calls the record's
 * own endpoint, so money and approval rules stay where they are.
 */
const SUBJECTS: Record<string, SubjectDef> = {
  RefundRequest: {
    title: "Refund request",
    href: "/dashboard/refunds",
    fields: (d) => [
      ["Reason", d.reason],
      ["Requested", rupees(d.requestedAmount) ?? "Full amount"],
      ["Approved", rupees(d.approvedAmount)],
      ["Curator note", d.curatorNote],
      ["Admin note", d.adminNote],
    ],
    actions: [
      {
        label: "Approve refund",
        when: ["PENDING_ADMIN", "REFUND_FAILED"],
        run: (id, n) => adminDecideRefund(id, { action: "APPROVE", note: note(n) }),
      },
      {
        label: "Reject",
        destructive: true,
        needsNote: true,
        when: ["PENDING_ADMIN"],
        run: (id, n) => adminDecideRefund(id, { action: "REJECT", note: note(n) }),
      },
    ],
  },
  SpaceRequest: {
    title: "New space request",
    href: "/dashboard/requests",
    fields: (d) => [
      ["Name", d.name],
      ["Type", d.type],
      ["City", [d.city, d.state].filter(Boolean).join(", ")],
      ["Website", d.websiteUrl],
      ["Their role", d.requesterRole],
      ["About", d.description],
    ],
    actions: [
      { label: "Approve", when: ["PENDING"], run: (id) => approveSpaceRequest(id) },
      { label: "Reject", destructive: true, needsNote: true, when: ["PENDING"], run: (id, n) => rejectSpaceRequest(id, note(n)) },
    ],
  },
  EventRequest: {
    title: "Event request",
    fields: (d) => [
      ["Event", d.title],
      ["When", `${when(d.startDateTime)} to ${when(d.endDateTime)}`],
      ["Format", String(d.type ?? "").replace(/_/g, " ").toLowerCase()],
      ["City", d.city],
      ["About", d.description],
      ["Turned down because", d.reviewNote],
    ],
    // Approve makes a personal space they run and the event in it as a draft.
    actions: [
      { label: "Approve", when: ["PENDING"], run: (id) => approveEventRequest(id) },
      { label: "Reject", destructive: true, needsNote: true, when: ["PENDING"], run: (id, n) => rejectEventRequest(id, note(n)) },
    ],
  },
  SpaceStatusRequest: {
    title: "Space status change",
    href: "/dashboard/requests/status",
    fields: (d) => [
      ["Change", `${d.currentStatus} → ${d.requestedStatus}`],
      ["Reason", d.reason],
    ],
    actions: review(reviewStatusRequest),
  },
  SpaceOwnershipRequest: {
    title: "Space ownership transfer",
    href: "/dashboard/requests/ownership",
    fields: (d) => [["Reason", d.reason]],
    actions: review((id, status, reviewNote) => reviewOwnershipRequest(id, { status, reviewNote })),
  },
  SubSpaceRequest: {
    title: "Sub-space request",
    href: "/dashboard/requests/subspace",
    fields: (d) => [
      ["Type", d.requestType],
      ["Reason", d.reason],
    ],
    actions: review(reviewSubSpaceRequest),
  },
  WhiteLabelRequest: {
    title: "White-label request",
    href: "/dashboard/requests/white-label",
    fields: (d) => [
      [
        "Colour",
        d.brandColor && (
          <span className="inline-flex items-center gap-2">
            <span className="size-3 rounded-full border border-border" style={{ background: d.brandColor }} />
            {d.brandColor}
          </span>
        ),
      ],
      ["Scope", d.eventId ? "One event" : "Whole space"],
      ["Reason", d.reason],
    ],
    actions: review(reviewWhiteLabelRequest),
  },
  FreeAttendeeAddRequest: {
    title: "Free attendee add",
    href: "/dashboard/requests/free-adds",
    fields: (d) => [
      ["Seats asked", d.requestedSeats],
      ["Seats approved", d.approvedSeats != null ? `${d.approvedSeats} (${d.usedSeats} used)` : null],
      ["Reason", d.reason],
    ],
    // Approves the seats asked for; a different count is set on the full queue.
    actions: review((id, status, reviewNote) => reviewFreeAddRequest(id, status, { reviewNote })).map((a) =>
      a.label === "Approve"
        ? { ...a, label: "Approve seats asked", run: (id, n, d) => reviewFreeAddRequest(id, "APPROVED", { reviewNote: note(n), approvedSeats: d.requestedSeats ?? undefined }) }
        : a
    ),
  },
  RegistrationTransferRequest: {
    title: "Ticket transfer",
    href: "/dashboard/requests/ticket-transfers",
    fields: (d) => [
      ["To", d.targetEmail],
      ["Reason", d.reason],
    ],
    actions: review((id, status, reviewNote) => reviewTransferRequest(id, status, { reviewNote })),
  },
  ContentReport: {
    title: "Report",
    href: "/dashboard/content-reports",
    fields: (d) => [
      ["About", d.targetType],
      ["Reason", d.reason],
      ["Details", d.details],
      ["Resolution", d.resolutionNote],
    ],
    actions: [
      { label: "Resolve", when: ["OPEN", "REVIEWING"], run: (id, n) => updateContentReport(id, "RESOLVED", note(n)) },
      { label: "Dismiss", destructive: true, when: ["OPEN", "REVIEWING"], run: (id, n) => updateContentReport(id, "DISMISSED", note(n)) },
    ],
  },
  PayoutBankAccount: {
    title: "Payout account",
    href: "/dashboard/bank-accounts",
    fields: (d) => [
      ["Holder", d.accountHolderName],
      ["UPI", d.upiId],
      ["Bank", [d.bankName, d.ifscCode].filter(Boolean).join(" · ")],
      ["Account", d.accountNumber && `•••• ${String(d.accountNumber).slice(-4)}`],
      ["Rejected because", d.rejectionReason],
    ],
    actions: [
      { label: "Verify", when: ["PENDING"], run: (id) => updateBankAccountStatus(id, { status: "VERIFIED" }) },
      {
        label: "Reject",
        destructive: true,
        needsNote: true,
        when: ["PENDING"],
        run: (id, n) => updateBankAccountStatus(id, { status: "REJECTED", rejectionReason: note(n) }),
      },
    ],
  },
  Payout: {
    title: "Payout request",
    href: "/dashboard/payouts",
    fields: (d) => [
      ["Amount", rupees(d.netAmount)],
      ["UTR", d.utr],
      ["Notes", d.notes],
      ["Failed because", d.failureReason],
    ],
    // Pay first through the bank, then record it here with the UTR.
    actions: [
      { label: "Mark paid with UTR", needsNote: true, when: ["PENDING"], run: (id, n) => markPayoutPaid(id, { utr: n.trim() }) },
      { label: "Cancel", destructive: true, when: ["PENDING"], run: (id) => cancelPayout(id) },
    ],
  },
  // Space-to-space requests: the other space decides, Unifesto only watches.
  EventOwnershipTransfer: { title: "Event ownership transfer", href: "/dashboard/events", fields: () => [], actions: [] },
  SubEventAttachRequest: { title: "Sub-event attach", href: "/dashboard/events", fields: () => [], actions: [] },
  EventCoHost: { title: "Co-host invite", href: "/dashboard/events", fields: () => [], actions: [] },
};

/** The typed record behind a case, with the actions its own endpoint allows. */
export function CaseActionPanel({ subject, onDone }: { subject: CaseSubject; onDone: () => void }) {
  const def = SUBJECTS[subject.type];
  const d = subject.data;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!def) return null;

  const actions = def.actions.filter((a) => a.when.includes(d.status));
  const run = async (a: Action) => {
    if (a.needsNote && !text.trim()) {
      setError(`Add a note to ${a.label.toLowerCase()}.`);
      return;
    }
    setBusy(a.label);
    setError("");
    const { error } = await a.run(d.id, text, d);
    setBusy(null);
    if (error) setError(error.message || `Could not ${a.label.toLowerCase()}.`);
    else {
      setText("");
      onDone();
    }
  };

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">{def.title}</CardTitle>
        <Badge variant={actions.length ? "warning" : "neutral"}>{String(d.status ?? "").replace(/_/g, " ").toLowerCase()}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-2 text-sm">
          {def.fields(d)
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="whitespace-pre-wrap break-words text-foreground">{v}</dd>
              </div>
            ))}
        </dl>
        {error && <ErrorNotice message={error} />}
        {actions.length > 0 && (
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Note (saved with the decision)"
              aria-label={`${def.title} note`}
            />
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button
                  key={a.label}
                  size="sm"
                  variant={a.destructive ? "outline" : "default"}
                  disabled={!!busy}
                  onClick={() => run(a)}
                >
                  {busy === a.label ? "Working…" : a.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {def.href && (
          <Link href={def.href} className="block text-xs text-muted-foreground underline-offset-4 hover:underline">
            Open the full queue
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
