"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Money, Bank, Clock, CheckCircle } from "@phosphor-icons/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  getAllPayoutsUnpaginated,
  getMyPayoutsUnpaginated,
  markPayoutPaid,
  cancelPayout,
  getAdminEventPayoutSummary,
  adminCreatePayoutForEvent,
  type Payout,
  type PayoutStatus,
  type EventPayoutSummary,
} from "@/lib/api/payouts-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const PAGE_SIZE = 20;

function money(v: number | string): string {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

function orgName(p: Payout): string {
  return p.user?.fullName || p.user?.username || "Organiser";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

const STATUS_BADGE: Record<
  PayoutStatus,
  { label: string; variant: "success" | "destructive" | "neutral" | "warning" }
> = {
  PENDING: { label: "Pending", variant: "warning" },
  PROCESSING: { label: "Processing", variant: "neutral" },
  COMPLETED: { label: "Paid", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
};

const OWED: PayoutStatus[] = ["PENDING", "PROCESSING"];

export default function PayoutsPage() {
  const { role } = useSession();
  const isAdmin = role === "platform_admin";

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<Payout | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    // Admins reconcile every space's payouts; organisers see only their own.
    const { data, error } = isAdmin
      ? await getAllPayoutsUnpaginated()
      : await getMyPayoutsUnpaginated();
    if (error) setError(error.message);
    else setPayouts(data ?? []);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  const summary = useMemo(() => {
    const now = new Date();
    let pending = 0;
    let paidThisMonth = 0;
    // Admins count distinct organisers due; organisers count distinct events.
    const dueUnits = new Set<string>();
    for (const p of payouts) {
      if (OWED.includes(p.status)) {
        pending += Number(p.netAmount);
        dueUnits.add(isAdmin ? p.userId : p.eventId);
      }
      if (p.status === "COMPLETED" && p.completedAt) {
        const d = new Date(p.completedAt);
        if (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        ) {
          paidThisMonth += Number(p.netAmount);
        }
      }
    }
    return { pending, paidThisMonth, dueUnits: dueUnits.size };
  }, [payouts, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payouts.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return [p.event?.title, orgName(p), p.utr, p.bankAccount?.bankName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [payouts, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        subtitle={
          isAdmin
            ? "Money released to organisations for their events"
            : "Payouts owed to and received by your space"
        }
        actions={
          isAdmin && (
            <Button onClick={() => setCreateOpen(true)}>Create payout</Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Pending payout"
          value={money(summary.pending)}
          hint={isAdmin ? "Owed to spaces" : "Owed to you"}
          icon={Clock}
          tone="brand"
          loading={loading}
        />
        <StatCard
          title="Paid out"
          value={money(summary.paidThisMonth)}
          hint="Released this month"
          icon={CheckCircle}
          tone="success"
          loading={loading}
        />
        <StatCard
          title={isAdmin ? "Spaces due" : "Events due"}
          value={summary.dueUnits}
          hint="Awaiting disbursement"
          icon={Bank}
          loading={loading}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by event, organiser, or UTR"
            aria-label="Search payouts"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as PayoutStatus | "all")}
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="COMPLETED">Paid</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout runs</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Each payout is the net owed to an organiser for one event. Transfer the funds manually, then mark it paid with the bank reference."
              : "Each payout is the net you earn from one event, after the platform fee. It's paid to your verified bank account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Money}
              title="No payouts scheduled"
              description="Once events earn revenue, payouts to their spaces will be queued here."
            />
          ) : (
            <div className="divide-y">
              {pageItems.map((p) => {
                const badge = STATUS_BADGE[p.status];
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {p.event?.title ?? "Event"}
                        </p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {isAdmin ? `${orgName(p)} · ` : ""}
                        {p.bankAccount
                          ? p.bankAccount.methodType === "UPI"
                            ? `UPI ${p.bankAccount.upiId ?? ""}`
                            : `${p.bankAccount.bankName ?? "Bank"} ····${(p.bankAccount.accountNumber ?? "").slice(-4)}`
                          : "no payout method"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Scheduled {formatDate(p.scheduledAt)}
                        {p.utr && ` · UTR ${p.utr}`}
                        {p.failureReason && ` · ${p.failureReason}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {money(p.netAmount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          gross {money(p.grossRevenue)}
                        </p>
                      </div>
                      {isAdmin && p.status === "PENDING" && (
                        <Button size="sm" onClick={() => setActive(p)}>
                          Mark paid
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {filtered.length} payouts
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {active && (
        <MarkPaidDialog
          payout={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            void load();
          }}
        />
      )}

      {createOpen && (
        <CreatePayoutDialog
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CreatePayoutDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [eventId, setEventId] = useState("");
  const [summary, setSummary] = useState<EventPayoutSummary | null>(null);
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [amount, setAmount] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  async function preview() {
    const id = eventId.trim();
    if (!id) return;
    setPreviewing(true);
    setErr("");
    setSummary(null);
    const { data, error } = await getAdminEventPayoutSummary(id);
    setPreviewing(false);
    if (error) setErr(error.message);
    else {
      setSummary(data);
      setMode("full");
      setAmount("");
    }
  }

  const available = summary?.available ?? 0;
  const customAmt = Number(amount);
  const customInvalid =
    mode === "custom" && (!amount || customAmt <= 0 || customAmt > available);

  async function create() {
    setCreating(true);
    setErr("");
    const custom = mode === "custom" ? customAmt : undefined;
    const { error } = await adminCreatePayoutForEvent(eventId.trim(), custom);
    setCreating(false);
    if (error) setErr(error.message);
    else onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create payout</DialogTitle>
          <DialogDescription>
            Queue a payout for an event on demand (uses the organiser&apos;s verified primary account). It then appears here to mark paid.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Event ID</label>
              <Input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="Paste the event ID" />
            </div>
            <Button variant="outline" onClick={preview} disabled={previewing || !eventId.trim()}>
              {previewing ? "…" : "Preview"}
            </Button>
          </div>

          {summary && (
            <div className="rounded-md border border-border p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Gross revenue</span><span className="font-medium">₹{summary.grossRevenue.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Platform fee ({summary.defaultPlatformFeePercent}%)</span><span className="font-medium">₹{summary.estimatedPlatformFee.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Event net</span><span className="font-medium">₹{summary.eventNet.toLocaleString("en-IN")}</span></div>
              {summary.committed > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Already paid / pending</span><span className="font-medium">−₹{summary.committed.toLocaleString("en-IN")}</span></div>
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Available</span><span className="font-semibold">₹{summary.available.toLocaleString("en-IN")}</span></div>

              {/* Amount: full balance or a custom net figure. */}
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  {(["full", "custom"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium ${mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      {m === "full" ? "Full balance" : "Custom amount"}
                    </button>
                  ))}
                </div>
                {mode === "custom" && (
                  <div className="space-y-1">
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={`Up to ₹${available.toLocaleString("en-IN")}`}
                    />
                    {customInvalid && amount !== "" && (
                      <p className="text-xs text-[hsl(358_65%_44%)]">
                        Enter an amount between ₹1 and ₹{available.toLocaleString("en-IN")}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {err && <p className="text-sm text-[hsl(358_65%_44%)]">{err}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button onClick={create} disabled={creating || !summary || available <= 0 || customInvalid}>
            {creating ? "Creating…" : "Create payout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({
  payout,
  onClose,
  onDone,
}: {
  payout: Payout;
  onClose: () => void;
  onDone: () => void;
}) {
  const [utr, setUtr] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const confirm = async () => {
    setErr("");
    setSubmitting(true);
    const { error } = await markPayoutPaid(payout.id, {
      utr: utr.trim() || undefined,
      reference: reference.trim() || undefined,
    });
    if (error) {
      setErr(error.message);
      setSubmitting(false);
    } else {
      onDone();
    }
  };

  const cancel = async () => {
    setErr("");
    setSubmitting(true);
    const { error } = await cancelPayout(payout.id);
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
          <DialogTitle>Mark payout paid</DialogTitle>
          <DialogDescription>
            {payout.event?.title} · {money(payout.netAmount)} to {orgName(payout)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Confirm you have transferred {money(payout.netAmount)} to the
            organiser&rsquo;s account. Record the bank reference for
            reconciliation.
          </p>
          <div>
            <label className="text-sm font-medium" htmlFor="payout-utr">
              UTR (optional)
            </label>
            <Input
              id="payout-utr"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="Bank transaction UTR"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="payout-ref">
              Reference (optional)
            </label>
            <Input
              id="payout-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Internal note or reference"
              className="mt-1"
            />
          </div>
          {err && <ErrorNotice message={err} />}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="destructive" onClick={cancel} disabled={submitting}>
            Cancel payout
          </Button>
          <Button onClick={confirm} disabled={submitting}>
            {submitting ? "Saving…" : "Mark paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
