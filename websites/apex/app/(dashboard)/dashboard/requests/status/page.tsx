"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowsLeftRight,
  Timer,
  CheckCircle,
  XCircle,
  ArrowRight,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getStatusRequests,
  reviewStatusRequest,
  type SpaceStatusRequest,
  type RequestStatus,
} from "@/lib/api/requests-api";

const STATUS_VARIANT: Record<
  RequestStatus,
  "warning" | "success" | "destructive"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

const FILTERS: { label: string; value: RequestStatus }[] = [
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Declined", value: "REJECTED" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function applicantName(r: SpaceStatusRequest) {
  return r.user?.fullName || r.user?.username || "Unknown applicant";
}

/**
 * Admin surface: incoming requests to change a space's lifecycle state
 * (e.g. ACTIVE → INACTIVE). Approving a request updates the space's status.
 * Backed by `GET /spaces/status-requests` + `PATCH /:id/review`.
 */
export default function StatusRequestsPage() {
  const [requests, setRequests] = useState<SpaceStatusRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<RequestStatus>("PENDING");
  const [acting, setActing] = useState<string | null>(null);
  const [counts, setCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getStatusRequests(filter);
    if (res.error) {
      setError(res.error.message || "Could not load status requests.");
      setRequests([]);
    } else {
      setRequests(res.data?.requests ?? []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshCounts = useCallback(async () => {
    const [pending, approved, rejected] = await Promise.all([
      getStatusRequests("PENDING"),
      getStatusRequests("APPROVED"),
      getStatusRequests("REJECTED"),
    ]);
    setCounts({
      PENDING: pending.data?.pagination.total ?? 0,
      APPROVED: approved.data?.pagination.total ?? 0,
      REJECTED: rejected.data?.pagination.total ?? 0,
    });
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const handleReview = async (
    id: string,
    status: "APPROVED" | "REJECTED"
  ) => {
    if (!window.confirm(`${status === "APPROVED" ? "Approve" : "Decline"} this request? This can't be undone.`)) return;
    setActing(id);
    const { error } = await reviewStatusRequest(id, status);
    if (!error) {
      await Promise.all([load(), refreshCounts()]);
    } else {
      setError(error.message || "Could not update the request.");
    }
    setActing(null);
  };

  const stats = useMemo(
    () => [
      {
        title: "Awaiting review",
        value: counts.PENDING,
        hint: "In the queue",
        icon: Timer,
        tone: "neutral" as const,
      },
      {
        title: "Approved",
        value: counts.APPROVED,
        hint: "All time",
        icon: CheckCircle,
        tone: "success" as const,
      },
      {
        title: "Declined",
        value: counts.REJECTED,
        hint: "All time",
        icon: XCircle,
        tone: "neutral" as const,
      },
    ],
    [counts]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Status requests"
        subtitle="Review requests to change a space's lifecycle state"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Review queue</CardTitle>
              <CardDescription>
                Each request shows the space and the lifecycle state change
                being requested.
              </CardDescription>
            </div>
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={
                    "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                    (filter === f.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4">
              <ErrorNotice message={error} />
            </div>
          )}

          {loading ? (
            <div className="space-y-px">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-8 w-40" />
                </div>
              ))}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={ArrowsLeftRight}
              title={filter === "PENDING" ? "The queue is clear" : "Nothing here"}
              description={
                filter === "PENDING"
                  ? "When a space requests a status change, it will land here for your review."
                  : `No ${filter.toLowerCase()} status requests yet.`
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {r.space?.name ?? "Unknown space"}
                      </p>
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </Badge>
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Badge variant="outline">{r.currentStatus}</Badge>
                        <ArrowRight className="h-3.5 w-3.5" />
                        <Badge variant="neutral">{r.requestedStatus}</Badge>
                      </span>
                    </div>
                    {r.reason && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {r.reason}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>By {applicantName(r)}</span>
                      <span>Requested {formatDate(r.createdAt)}</span>
                    </div>
                    {r.reviewNote && r.status !== "PENDING" && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        Note: {r.reviewNote}
                      </p>
                    )}
                  </div>

                  {r.status === "PENDING" && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting === r.id}
                        onClick={() => handleReview(r.id, "REJECTED")}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        disabled={acting === r.id}
                        onClick={() => handleReview(r.id, "APPROVED")}
                      >
                        Approve
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
