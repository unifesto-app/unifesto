"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Buildings,
  CalendarBlank,
  Envelope,
  Phone,
  Receipt,
  Ticket,
  User as UserIcon,
} from "@unifesto/unicon/react";
import {
  getAdminTransaction,
  reconcileTransaction,
  resolveTransaction,
  type TransactionDetail,
  type TransactionPaymentStatus,
} from "@/lib/api/admin-transactions-api";
import { adminRefund } from "@/lib/api/refunds-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inr } from "@/lib/utils/money";

const money = inr;

function fmtDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STATUS_BADGE: Record<
  TransactionPaymentStatus,
  { label: string; variant: "success" | "destructive" | "neutral" | "warning" }
> = {
  PENDING: { label: "Pending", variant: "warning" },
  PAID: { label: "Paid", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  REFUNDED: { label: "Refunded", variant: "neutral" },
  PARTIALLY_REFUNDED: { label: "Partial refund", variant: "warning" },
};

function displayName(u: {
  fullName: string | null;
  username: string | null;
  email?: string | null;
}): string {
  return u.fullName || u.username || u.email || "Unknown";
}

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id;
  // Deep-linked from the Reconciliation dashboard: a `?pay=pay_…` prefill so the
  // admin lands ready to reconcile an orphaned/unrecorded Razorpay payment.
  const prefillPay = searchParams.get("pay") ?? "";

  const [txn, setTxn] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reconcile-with-Razorpay action (only for PENDING transactions).
  const [reconciling, setReconciling] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [actionErr, setActionErr] = useState("");
  // Optional pay_… id for orphaned orders (retry overwrote the order).
  // Seeded from a `?pay=` deep link (Reconciliation dashboard).
  const [payId, setPayId] = useState(prefillPay);
  // Admin-initiated refund dialog (only for PAID / partially refunded).
  const [showRefund, setShowRefund] = useState(false);
  // Manual resolve dialog (only for PENDING that reconcile can't settle).
  const [showResolve, setShowResolve] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getAdminTransaction(id);
    if (error) setError(error.message);
    else if (data) setTxn(data.transaction);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runReconcile = useCallback(async () => {
    setReconciling(true);
    setActionMsg("");
    setActionErr("");
    const { data, error } = await reconcileTransaction(id, payId.trim() || undefined);
    if (error) {
      setActionErr(error.message);
    } else if (data) {
      setActionMsg(data.detail);
      if (data.changed) await load();
    }
    setReconciling(false);
  }, [id, payId, load]);

  const badge = txn ? STATUS_BADGE[txn.paymentStatus] : null;
  const canRefund =
    txn?.paymentStatus === "PAID" ||
    txn?.paymentStatus === "PARTIALLY_REFUNDED";

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/transactions")}
          className="-ml-2 mb-3 gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to transactions
        </Button>
      </div>

      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <Card className="rounded-lg border border-destructive/30 bg-destructive-soft px-4">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : txn && badge ? (
        <>
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                  {displayName(txn.user)}
                </h1>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {txn.event.title}
                {txn.ticketType ? ` · ${txn.ticketType.name}` : ""}
              </p>
              {txn.paymentId && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {txn.paymentId}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <p className="text-2xl font-semibold text-foreground">
                  {money(txn.totalAmount)}
                </p>
                {Number(txn.refundedAmount) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {money(txn.refundedAmount)} refunded
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  {txn.paymentStatus === "PENDING" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void runReconcile()}
                        disabled={reconciling}
                      >
                        {reconciling ? "Checking Razorpay…" : "Reconcile with Razorpay"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResolve(true)}
                      >
                        Mark manually
                      </Button>
                    </>
                  )}
                  {canRefund && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRefund(true)}
                    >
                      Issue refund
                    </Button>
                  )}
                </div>
                {txn.paymentStatus === "PENDING" && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={payId}
                      onChange={(e) => setPayId(e.target.value)}
                      placeholder="pay_… (if order was retried)"
                      className="h-8 w-56 font-mono text-xs"
                      aria-label="Razorpay payment ID (optional)"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reconcile outcome */}
          {(actionMsg || actionErr) && (
            <div
              className={
                actionErr
                  ? "rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive"
                  : "rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
              }
            >
              {actionErr || actionMsg}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Payment breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Payment breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Row label="Total amount" value={money(txn.totalAmount)} />
                  <Row
                    label="Paid to gateway"
                    value={money(txn.razorpayAmount)}
                  />
                  <Row
                    label="Processing fee"
                    value={money(txn.processingFee)}
                  />
                  <Row
                    label="Refunded"
                    value={money(txn.refundedAmount)}
                  />
                  <Row
                    label="Quantity"
                    value={
                      txn.groupSize
                        ? `${txn.quantity} · group of ${txn.groupSize}`
                        : String(txn.quantity)
                    }
                  />
                  <Row label="Order ID" value={txn.orderId} mono />
                  <Row label="Payment ID" value={txn.paymentId} mono />
                  <Row
                    label="Registration status"
                    value={txn.status.toLowerCase().replace(/_/g, " ")}
                  />
                  <Row label="Paid at" value={fmtDateTime(txn.paidAt)} />
                  <Row
                    label="Registered at"
                    value={fmtDateTime(txn.registeredAt)}
                  />
                  {txn.cancelledAt && (
                    <Row
                      label="Cancelled at"
                      value={fmtDateTime(txn.cancelledAt)}
                    />
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Attendee */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  Attendee
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                <Link
                  href={`/dashboard/users/${txn.user.id}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {displayName(txn.user)}
                </Link>
                {txn.user.username && (
                  <p className="text-xs text-muted-foreground">
                    @{txn.user.username}
                  </p>
                )}
                <IconRow Icon={Envelope} value={txn.user.email} />
                <IconRow Icon={Phone} value={txn.user.mobileNumber} />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Event */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarBlank className="h-4 w-4 text-muted-foreground" />
                  Event
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {txn.event.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {txn.event.type.replace(/_/g, " ").toLowerCase()} ·{" "}
                    {txn.event.status.toLowerCase()}
                  </p>
                </div>
                <dl className="grid grid-cols-1 gap-y-2">
                  <Row label="Starts" value={fmtDateTime(txn.event.startDateTime)} />
                  <Row
                    label="Ticket type"
                    value={txn.ticketType?.name ?? "—"}
                  />
                  <Row label="Slug" value={txn.event.slug} mono />
                </dl>
              </CardContent>
            </Card>

            {/* Curator / Space */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Buildings className="h-4 w-4 text-muted-foreground" />
                  Curator &amp; space
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                <div>
                  <Link
                    href={`/dashboard/spaces/${txn.space.id}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {txn.space.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    @{txn.space.slug}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{txn.space.plan.toLowerCase()}</Badge>
                  <Badge variant="neutral">
                    {txn.space.status.toLowerCase()}
                  </Badge>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Curator
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {displayName(txn.organiser)}
                  </p>
                  {txn.organiser.email && (
                    <p className="text-xs text-muted-foreground">
                      {txn.organiser.email}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tickets */}
          {txn.tickets.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  Tickets ({txn.tickets.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Code</th>
                        <th className="pb-2 pr-4 font-medium">Attendee</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                        <th className="pb-2 font-medium">Checked in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txn.tickets.map((tk) => (
                        <tr
                          key={tk.id}
                          className="border-b border-border/60 last:border-0"
                        >
                          <td className="py-3 pr-4 font-mono text-xs text-foreground">
                            {tk.ticketCode}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {tk.attendeeName || tk.attendeeEmail || "—"}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant="outline">
                              {tk.status.toLowerCase()}
                            </Badge>
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {tk.checkedInAt ? fmtDateTime(tk.checkedInAt) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Refund requests */}
          {txn.refundRequests.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Refund requests ({txn.refundRequests.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {txn.refundRequests.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="neutral">
                        {r.status.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(r.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{r.reason}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Requested by {r.requesterRole.toLowerCase()}
                      </span>
                      {r.requestedAmount != null && (
                        <span>Requested {money(r.requestedAmount)}</span>
                      )}
                      {r.approvedAmount != null && (
                        <span>Approved {money(r.approvedAmount)}</span>
                      )}
                      {Number(r.cashRefunded) > 0 && (
                        <span>Cash {money(r.cashRefunded)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {showResolve && (
            <ResolvePendingDialog
              transactionId={txn.id}
              eventTitle={txn.event.title}
              attendeeName={displayName(txn.user)}
              onClose={() => setShowResolve(false)}
              onDone={(detail) => {
                setShowResolve(false);
                setActionMsg(detail);
                void load();
              }}
            />
          )}

          {showRefund && (
            <AdminRefundDialog
              registrationId={txn.id}
              eventTitle={txn.event.title}
              attendeeName={displayName(txn.user)}
              maxBase={
                Number(txn.totalAmount) -
                Number(txn.processingFee) -
                Number(txn.refundedAmount)
              }
              onClose={() => setShowRefund(false)}
              onDone={() => {
                setShowRefund(false);
                setActionMsg("Refund issued.");
                void load();
              }}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function ResolvePendingDialog({
  transactionId,
  eventTitle,
  attendeeName,
  onClose,
  onDone,
}: {
  transactionId: string;
  eventTitle: string;
  attendeeName: string;
  onClose: () => void;
  onDone: (detail: string) => void;
}) {
  const [outcome, setOutcome] = useState<"FAILED" | "CANCELLED">("CANCELLED");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    setSubmitting(true);
    const { data, error } = await resolveTransaction(transactionId, {
      outcome,
      note: note.trim() || undefined,
    });
    if (error) {
      setErr(error.message);
      setSubmitting(false);
    } else {
      onDone(data?.detail ?? "Registration resolved.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve manually</DialogTitle>
          <DialogDescription>
            {eventTitle} · {attendeeName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            For a pending registration that has no payment to reconcile — an
            abandoned attempt or a duplicate. This moves no money and issues no
            ticket. To refund a payment that went through, use the paid
            registration instead.
          </p>

          <div>
            <label className="text-sm font-medium" htmlFor="resolve-outcome">
              Outcome
            </label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as "FAILED" | "CANCELLED")}
            >
              <SelectTrigger id="resolve-outcome" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CANCELLED">
                  Cancel registration (failed &amp; cancelled)
                </SelectItem>
                <SelectItem value="FAILED">
                  Mark payment failed (keep registration)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="resolve-note">
              Note (optional, kept in logs)
            </label>
            <Textarea
              id="resolve-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why you're resolving this manually"
              className="mt-1"
              rows={3}
            />
          </div>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Saving…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminRefundDialog({
  registrationId,
  eventTitle,
  attendeeName,
  maxBase,
  onClose,
  onDone,
}: {
  registrationId: string;
  eventTitle: string;
  attendeeName: string;
  maxBase: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(maxBase));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!reason.trim()) {
      setErr("Please give a reason for this refund.");
      return;
    }
    const amt = Number(amount);
    if (!(amt > 0) || amt > maxBase) {
      setErr(`Amount must be between ₹1 and ${money(maxBase)}.`);
      return;
    }
    setSubmitting(true);
    const { error } = await adminRefund({
      registrationId,
      reason: reason.trim(),
      approvedAmount: amt,
    });
    if (error) {
      setErr(error.message);
      setSubmitting(false);
    } else {
      onDone();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue refund</DialogTitle>
          <DialogDescription>
            {eventTitle} · {attendeeName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="admin-refund-amount">
              Refund amount (base only)
            </label>
            <Input
              id="admin-refund-amount"
              type="number"
              min={0}
              max={maxBase}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Max refundable base is {money(maxBase)}. The processing fee is not
              refunded. Enter a lower value for a partial refund.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="admin-refund-reason">
              Reason
            </label>
            <Textarea
              id="admin-refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this refund is being issued"
              className="mt-1"
              rows={3}
            />
          </div>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Refunding…" : "Approve & refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs font-medium text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`truncate text-right text-sm text-foreground ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function IconRow({
  Icon,
  value,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  value: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <span className="truncate text-sm text-foreground">
        {value || <span className="text-muted-foreground">Not provided</span>}
      </span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
