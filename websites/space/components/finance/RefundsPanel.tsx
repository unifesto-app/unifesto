"use client";

import { inr } from "@/lib/utils/money";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowsClockwise, CheckCircle, XCircle, Clock, ArrowRight } from "@unifesto/unicon/react";
import {
  getCuratorRefundQueue,
  curatorReviewRefund,
  refundableBase,
  type RefundRequest,
  type RefundStatus,
} from "@/lib/api/refunds-api";
import { useSession } from "@/lib/context/SessionContext";
import { appRoleFromCode } from "@/lib/types/rbac";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const money = (v: number | string) => inr(v);

const STATUS: Record<RefundStatus, { label: string; variant: "warning" | "neutral" | "success" | "destructive" }> = {
  PENDING_CURATOR: { label: "Awaiting your review", variant: "warning" },
  PENDING_ADMIN: { label: "Forwarded to admin", variant: "neutral" },
  PROCESSING: { label: "Processing", variant: "neutral" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
};

const PAGE_SIZE = 20;

// Scope sentinel: review refunds across every space the operator administers.
const ALL_SPACES = "__all__";

export function RefundsPanel() {
  const { spaces, currentSpace } = useSession();
  const currentSpaceId = currentSpace?.id ?? "";

  // Spaces whose refunds this operator can actually review (Space Admins). A
  // single-space operator never sees the selector; the list drives it otherwise.
  const reviewableSpaces = useMemo(
    () => spaces.filter((s) => appRoleFromCode(s.userRole?.code) === "space_admin"),
    [spaces],
  );

  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [status, setStatus] = useState<RefundStatus | "all">("PENDING_CURATOR");
  // "" until the current space resolves; then a spaceId, or ALL_SPACES.
  const [scope, setScope] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Default the panel to the space shown in the header, once it's known.
  useEffect(() => {
    if (!scope && currentSpaceId) setScope(currentSpaceId);
  }, [scope, currentSpaceId]);

  const load = useCallback(async () => {
    if (!scope) return; // wait for the current space to resolve
    setLoading(true);
    setError("");
    const { data, error } = await getCuratorRefundQueue({
      page,
      limit: PAGE_SIZE,
      status: status === "all" ? undefined : status,
      // ALL_SPACES → omit spaceId; backend then returns every administered space.
      spaceId: scope === ALL_SPACES ? undefined : scope,
    });
    if (error) setError(error.message);
    else if (data) {
      setRequests(data.requests);
      setTotalPages(data.pagination.totalPages || 1);
    }
    setLoading(false);
  }, [page, status, scope]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, scope]);

  async function review(r: RefundRequest, action: "FORWARD" | "REJECT") {
    let note: string | undefined;
    if (action === "REJECT") {
      const reason = window.prompt("Why are you rejecting this refund? (shown to the attendee)");
      if (reason === null) return;
      note = reason.trim() || undefined;
    } else if (!window.confirm("Forward this refund to the admin for approval?")) {
      return;
    }
    setBusy(r.id);
    const { error } = await curatorReviewRefund(r.id, { action, note });
    setBusy(null);
    if (error) setError(error.message);
    else void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {reviewableSpaces.length > 1 && (
          <Select value={scope || currentSpaceId} onValueChange={setScope}>
            <SelectTrigger className="w-56" aria-label="Filter by space">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SPACES}>All my spaces</SelectItem>
              {reviewableSpaces.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={(v) => setStatus(v as RefundStatus | "all")}>
          <SelectTrigger className="w-56" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING_CURATOR">Awaiting your review</SelectItem>
            <SelectItem value="PENDING_ADMIN">Forwarded to admin</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={ArrowsClockwise}
              title="No refund requests here"
              description={
                status === "PENDING_CURATOR"
                  ? "Nothing is waiting on your review right now. New requests land here as attendees submit them."
                  : "No requests match this filter."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const s = STATUS[r.status];
            const attendee = r.registration?.user?.fullName || r.registration?.user?.username || "Attendee";
            const base = refundableBase(r.registration);
            const requested = r.requestedAmount ? Number(r.requestedAmount) : base;
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{attendee}</p>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.event?.space?.name ? `${r.event.space.name} · ` : ""}
                        {r.event?.title ?? "Event"} · requested {money(requested)} of {money(base)} refundable
                      </p>
                      <p className="mt-1 text-sm text-foreground">{r.reason}</p>
                      {r.curatorNote && (
                        <p className="mt-1 text-xs text-muted-foreground">My note: {r.curatorNote}</p>
                      )}
                    </div>
                  </div>

                  {r.status === "PENDING_CURATOR" && (
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => review(r, "REJECT")}>
                        <XCircle className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                      <Button size="sm" disabled={busy === r.id} onClick={() => review(r, "FORWARD")}>
                        {busy === r.id ? "…" : <><ArrowRight className="mr-1 h-4 w-4" />Forward to admin</>}
                      </Button>
                    </div>
                  )}
                  {r.status === "PENDING_ADMIN" && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> Waiting on the admin&apos;s decision.
                    </p>
                  )}
                  {(r.status === "APPROVED" || r.status === "REJECTED") && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {r.status === "APPROVED"
                        ? <><CheckCircle className="h-3.5 w-3.5 text-success" /> Refunded {money(r.cashRefunded)}.</>
                        : <><XCircle className="h-3.5 w-3.5 text-destructive" /> Rejected{r.adminNote ? ` — ${r.adminNote}` : ""}.</>}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
