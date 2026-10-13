"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  MagnifyingGlass,
  Clock,
  CheckCircle,
  XCircle,
} from "@unifesto/unicon/react";
import {
  getAllRefundRequests,
  adminDecideRefund,
  refundableBase,
  type RefundRequest,
  type RefundStatus,
} from "@/lib/api/refunds-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function name(u?: { fullName: string | null; username: string | null }): string {
  return u?.fullName || u?.username || "Unknown";
}

const STATUS_BADGE: Record<
  RefundStatus,
  { label: string; variant: "success" | "destructive" | "neutral" | "warning" }
> = {
  PENDING_CURATOR: { label: "Awaiting curator", variant: "neutral" },
  PENDING_ADMIN: { label: "Awaiting admin", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Declined", variant: "destructive" },
};

/** Platform admins act on requests a curator has already forwarded. */
const ACTIONABLE: RefundStatus = "PENDING_ADMIN";

export default function RefundsPage() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [counts, setCounts] = useState({ awaiting: 0, approved: 0, declined: 0 });
  const [statusFilter, setStatusFilter] = useState<RefundStatus | "all">(ACTIONABLE);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<RefundRequest | null>(null);

  const loadCounts = useCallback(async () => {
    const statuses: RefundStatus[] = [ACTIONABLE, "APPROVED", "REJECTED"];
    const [awaiting, approved, declined] = await Promise.all(
      statuses.map((status) => getAllRefundRequests({ status, limit: 1 }))
    );
    setCounts({
      awaiting: awaiting.data?.pagination.total ?? 0,
      approved: approved.data?.pagination.total ?? 0,
      declined: declined.data?.pagination.total ?? 0,
    });
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getAllRefundRequests({
      status: statusFilter === "all" ? undefined : statusFilter,
      page,
      limit: PAGE_SIZE,
    });
    if (error) setError(error.message);
    else if (data) {
      setRequests(data.requests);
      setTotalPages(data.pagination.totalPages || 1);
    }
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const refresh = () => {
    void loadCounts();
    void loadList();
  };

  // Client-side search over the loaded page (the list endpoint has no search).
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      [name(r.requestedBy), name(r.registration?.user), r.event?.title, r.reason]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [requests, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refunds"
        subtitle="Refund requests across every space"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Awaiting action"
          value={counts.awaiting}
          hint="Needs a decision"
          icon={Clock}
          tone="brand"
          loading={loading}
        />
        <StatCard
          title="Approved"
          value={counts.approved}
          hint="Refunded to payers"
          icon={CheckCircle}
          tone="success"
          loading={loading}
        />
        <StatCard
          title="Declined"
          value={counts.declined}
          hint="Requests rejected"
          icon={XCircle}
          loading={loading}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by event, requester, or reason"
            className="pl-9"
            aria-label="Search refunds"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as RefundStatus | "all")}
        >
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ACTIONABLE}>Awaiting action</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Declined</SelectItem>
            <SelectItem value="all">All requests</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={ArrowsClockwise}
              title="No refund requests"
              description="When attendees request refunds, they'll queue here for review."
            />
          ) : (
            <div className="divide-y">
              {visible.map((r) => {
                const badge = STATUS_BADGE[r.status];
                const remaining = refundableBase(r.registration);
                return (
                  <div
                    key={r.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {r.event?.title ?? "Event"}
                        </p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {name(r.registration?.user)} · requested by{" "}
                        {name(r.requestedBy)} ({r.requesterRole.toLowerCase()})
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        &ldquo;{r.reason}&rdquo;
                      </p>
                      {r.curatorNote && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Curator: {r.curatorNote}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                      <div className="text-right">
                        {r.status === "APPROVED" ? (
                          <p className="text-sm font-semibold text-success">
                            {money(r.approvedAmount ?? 0)} refunded
                          </p>
                        ) : (
                          <p className="text-sm font-semibold">
                            {money(
                              r.requestedAmount != null
                                ? r.requestedAmount
                                : remaining
                            )}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          base refundable {money(remaining)}
                        </p>
                      </div>
                      {r.status === ACTIONABLE && (
                        <Button size="sm" onClick={() => setActive(r)}>
                          Review
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
            Page {page} of {totalPages}
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
        <RefundReviewDialog
          request={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RefundReviewDialog({
  request,
  onClose,
  onDone,
}: {
  request: RefundRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const maxBase = refundableBase(request.registration);
  const defaultAmount =
    request.requestedAmount != null ? Number(request.requestedAmount) : maxBase;

  const [amount, setAmount] = useState(String(defaultAmount));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (approve: boolean) => {
    setErr("");
    if (!approve && !note.trim()) {
      setErr("Please give a reason for declining.");
      return;
    }
    setSubmitting(true);
    const amt = Number(amount);
    if (approve && (!(amt > 0) || amt > maxBase)) {
      setErr(`Amount must be between ₹1 and ${money(maxBase)}.`);
      setSubmitting(false);
      return;
    }
    const { error } = await adminDecideRefund(request.id, {
      action: approve ? "APPROVE" : "REJECT",
      approvedAmount: approve ? amt : undefined,
      note: note.trim() || undefined,
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
          <DialogTitle>Review refund</DialogTitle>
          <DialogDescription>
            {request.event?.title} · {name(request.registration?.user)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="text-muted-foreground">Reason</p>
            <p className="mt-0.5">&ldquo;{request.reason}&rdquo;</p>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="refund-amount">
              Refund amount (base only)
            </label>
            <Input
              id="refund-amount"
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
            <label className="text-sm font-medium" htmlFor="refund-note">
              Note (optional; required to decline)
            </label>
            <Textarea
              id="refund-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for this decision"
              className="mt-1"
              rows={3}
            />
          </div>

          {err && <ErrorNotice message={err} />}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="destructive"
            onClick={() => submit(false)}
            disabled={submitting}
          >
            Decline
          </Button>
          <Button onClick={() => submit(true)} disabled={submitting}>
            {submitting ? "Saving…" : "Approve & refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
