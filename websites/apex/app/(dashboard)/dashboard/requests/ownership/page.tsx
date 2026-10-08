"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HandArrowUp,
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
  getAllOwnershipRequests,
  reviewOwnershipRequest,
  type SpaceOwnershipRequest,
  type OwnershipRequestStatus,
} from "@/lib/api/spaces-api";

const STATUS_VARIANT: Record<
  OwnershipRequestStatus,
  "warning" | "success" | "destructive"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

const FILTERS: { label: string; value: OwnershipRequestStatus }[] = [
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Declined", value: "REJECTED" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function personName(
  p: { fullName: string | null; username: string | null } | undefined,
  fallback: string
) {
  return p?.fullName || p?.username || fallback;
}

/**
 * Admin surface: creators asking to hand a space to another member.
 *
 * Approving is not cosmetic — it moves the space's owner, which changes who it
 * bills to and who has final say. The backend promotes the new owner to
 * Space Admin and keeps the outgoing creator as a Space Admin in one
 * transaction, so a space is never left with no owner or two.
 */
export default function OwnershipRequestsPage() {
  const [requests, setRequests] = useState<SpaceOwnershipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<OwnershipRequestStatus>("PENDING");
  const [acting, setActing] = useState<string | null>(null);
  const [counts, setCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getAllOwnershipRequests({ status: filter });
    if (res.error) {
      setError(res.error.message || "Could not load ownership requests.");
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
      getAllOwnershipRequests({ status: "PENDING" }),
      getAllOwnershipRequests({ status: "APPROVED" }),
      getAllOwnershipRequests({ status: "REJECTED" }),
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
    setActing(id);
    const { error } = await reviewOwnershipRequest(id, { status });
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
    <div className="space-y-6">
      <PageHeader
        title="Ownership transfers"
        subtitle="Review creators handing a space to another member"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Review queue</CardTitle>
              <CardDescription>
                Approving moves the space to the new owner, makes them the
                owner, and keeps the outgoing creator as a Space Admin.
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
              icon={HandArrowUp}
              title={filter === "PENDING" ? "The queue is clear" : "Nothing here"}
              description={
                filter === "PENDING"
                  ? "When a creator asks to hand their space to someone else, it will land here for your review."
                  : `No ${filter.toLowerCase()} ownership transfers yet.`
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {r.space?.name ?? "Unknown space"}
                      </p>
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                      <Badge variant="outline">
                        {personName(r.requester, "Current owner")}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <Badge variant="neutral">
                        {personName(r.newOwner, "New owner")}
                      </Badge>
                    </div>
                    {r.reason && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                        {r.reason}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
