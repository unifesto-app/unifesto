"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardText,
  Timer,
  CheckCircle,
  XCircle,
  MapPin,
  Globe,
} from "@phosphor-icons/react";
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
  getSpaceRequests,
  approveSpaceRequest,
  rejectSpaceRequest,
  type SpaceRequest,
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
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function applicantName(r: SpaceRequest) {
  return r.user?.fullName || r.user?.username || "Unknown applicant";
}

function location(r: SpaceRequest) {
  return [r.city, r.state, r.country].filter(Boolean).join(", ");
}

/**
 * Admin surface: incoming requests to create a new space. Backed by
 * `GET /spaces/requests` with approve / reject actions.
 */
export default function SpaceRequestsPage() {
  const [requests, setRequests] = useState<SpaceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<RequestStatus>("PENDING");
  const [acting, setActing] = useState<string | null>(null);
  const [counts, setCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getSpaceRequests(filter);
    if (res.error) {
      setError(res.error.message || "Could not load space requests.");
      setRequests([]);
    } else {
      setRequests(res.data ?? []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshCounts = useCallback(async () => {
    const [pending, approved, rejected] = await Promise.all([
      getSpaceRequests("PENDING"),
      getSpaceRequests("APPROVED"),
      getSpaceRequests("REJECTED"),
    ]);
    setCounts({
      PENDING: pending.data?.length ?? 0,
      APPROVED: approved.data?.length ?? 0,
      REJECTED: rejected.data?.length ?? 0,
    });
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const handleApprove = async (id: string) => {
    setActing(id);
    const { error } = await approveSpaceRequest(id);
    if (!error) {
      await Promise.all([load(), refreshCounts()]);
    } else {
      setError(error.message || "Could not approve the request.");
    }
    setActing(null);
  };

  const handleReject = async (id: string) => {
    setActing(id);
    const { error } = await rejectSpaceRequest(id);
    if (!error) {
      await Promise.all([load(), refreshCounts()]);
    } else {
      setError(error.message || "Could not decline the request.");
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
        title="Space requests"
        subtitle="Review and approve new organisations before they go live"
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
                Requests appear newest-first, each with the applicant and
                proposed space.
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
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-40" />
                </div>
              ))}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={ClipboardText}
              title={filter === "PENDING" ? "The queue is clear" : "Nothing here"}
              description={
                filter === "PENDING"
                  ? "When someone requests a new space, it will land here for your review."
                  : `No ${filter.toLowerCase()} space requests yet.`
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
                        {r.name}
                      </p>
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </Badge>
                      <Badge variant="outline">{r.type}</Badge>
                    </div>
                    {r.description && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>By {applicantName(r)}</span>
                      {location(r) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {location(r)}
                        </span>
                      )}
                      {r.websiteUrl && (
                        <a
                          href={r.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5" /> Website
                        </a>
                      )}
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
                        onClick={() => handleReject(r.id)}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        disabled={acting === r.id}
                        onClick={() => handleApprove(r.id)}
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
