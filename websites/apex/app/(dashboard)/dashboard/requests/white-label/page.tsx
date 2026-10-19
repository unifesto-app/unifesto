"use client";

import { useCallback, useEffect, useState } from "react";
import { PaintBrush, WarningCircle } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getWhiteLabelRequests,
  reviewWhiteLabelRequest,
  type WhiteLabelRequest,
} from "@/lib/api/white-label-api";
import type { RequestStatus } from "@/lib/api/requests-api";

const STATUS_VARIANT: Record<
  RequestStatus,
  "warning" | "success" | "destructive"
> = { PENDING: "warning", APPROVED: "success", REJECTED: "destructive" };

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

function requesterName(r: WhiteLabelRequest) {
  return r.requester?.fullName || r.requester?.username || "Unknown requester";
}

/**
 * Admin surface: incoming white-label (organiser branding) requests for spaces
 * and events. Backed by `GET /white-label/requests`; approving applies the
 * proposed branding and flips the target's `whiteLabelEnabled` on.
 */
export default function WhiteLabelRequestsPage() {
  const [requests, setRequests] = useState<WhiteLabelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<RequestStatus>("PENDING");
  const [acting, setActing] = useState<string | null>(null);
  // Row whose decline-reason box is open, and its draft reason.
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getWhiteLabelRequests(filter);
    if (res.error) {
      setError(res.error.message || "Could not load white-label requests.");
      setRequests([]);
    } else {
      setRequests(res.data?.requests ?? []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (
    id: string,
    status: "APPROVED" | "REJECTED",
    reviewNote?: string
  ) => {
    if (!window.confirm(`${status === "APPROVED" ? "Approve" : "Decline"} this request? This can't be undone.`)) return;
    setActing(id);
    const { error } = await reviewWhiteLabelRequest(
      id,
      status,
      reviewNote?.trim() || undefined
    );
    if (error) {
      setError(error.message || "Could not update the request.");
    } else {
      setDeclining(null);
      setNote("");
      await load();
    }
    setActing(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="White-label requests"
        subtitle="Approve accent colours for spaces and events"
      />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Review queue</CardTitle>
              <CardDescription>
                Approving applies the proposed accent colour and turns
                white-label on. A space&rsquo;s colour also applies to its events.
                It only shows publicly while the space&rsquo;s plan includes
                white-label.
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
              icon={PaintBrush}
              title={filter === "PENDING" ? "The queue is clear" : "Nothing here"}
              description={
                filter === "PENDING"
                  ? "When a space requests white-label, it will land here for review."
                  : `No ${filter.toLowerCase()} white-label requests yet.`
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id} className="space-y-3 px-6 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {r.brandColor && (
                      <span
                        aria-label={`Proposed colour ${r.brandColor}`}
                        className="hidden h-10 w-10 shrink-0 rounded-lg border border-border sm:block"
                        style={{ backgroundColor: r.brandColor }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground">
                          {r.space.name}
                        </p>
                        <Badge variant={STATUS_VARIANT[r.status]}>
                          {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                        </Badge>
                        <Badge variant="outline">
                          {r.event ? "Event" : "Space"}
                        </Badge>
                      </div>
                      {r.event && (
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          Event: {r.event.title}
                        </p>
                      )}
                      {r.reason && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {r.reason}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span>By {requesterName(r)}</span>
                        {r.brandColor && (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="inline-block h-4 w-4 rounded border border-border"
                              style={{ backgroundColor: r.brandColor }}
                            />
                            {r.brandColor}
                          </span>
                        )}
                        <span>Requested {formatDate(r.createdAt)}</span>
                      </div>
                      {r.status === "PENDING" && r.planHasBranding === false && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-warning">
                          <WarningCircle className="h-3.5 w-3.5" weight="fill" />
                          This space&rsquo;s plan doesn&rsquo;t include white-label,
                          so the colour won&rsquo;t show until it&rsquo;s upgraded.
                        </p>
                      )}
                      {r.reviewNote && r.status !== "PENDING" && (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          Note: {r.reviewNote}
                        </p>
                      )}
                    </div>

                    {r.status === "PENDING" && declining !== r.id && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acting === r.id}
                          onClick={() => {
                            setDeclining(r.id);
                            setNote("");
                          }}
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          disabled={acting === r.id}
                          onClick={() => decide(r.id, "APPROVED")}
                        >
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>

                  {declining === r.id && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                      <Textarea
                        autoFocus
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Reason shown to the requester (optional)"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={acting === r.id}
                          onClick={() => setDeclining(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={acting === r.id}
                          onClick={() => decide(r.id, "REJECTED", note)}
                        >
                          {acting === r.id ? "Declining…" : "Decline request"}
                        </Button>
                      </div>
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
