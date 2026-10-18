"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
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
  getFreeAddRequests,
  reviewFreeAddRequest,
  revokeFreeAddRequest,
  type FreeAddRequest,
  type FreeAddStatus,
} from "@/lib/api/free-add-api";
import type { RequestStatus } from "@/lib/api/requests-api";

const STATUS_VARIANT: Record<
  FreeAddStatus,
  "warning" | "success" | "destructive"
> = { PENDING: "warning", APPROVED: "success", REJECTED: "destructive", REVOKED: "destructive" };

const FILTERS: { label: string; value: FreeAddStatus }[] = [
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Declined", value: "REJECTED" },
  { label: "Revoked", value: "REVOKED" },
];

/** "VIP only · 12 of 20 seats used" style summary of an approval's scope. */
function seatsLine(r: FreeAddRequest) {
  const scope = r.ticketType ? `${r.ticketType.name} only` : "Any ticket";
  if (r.status === "PENDING") {
    return `${scope} · ${r.requestedSeats != null ? `${r.requestedSeats} seats asked` : "no seat count given"}`;
  }
  if (r.status === "APPROVED" || r.status === "REVOKED") {
    return `${scope} · ${r.usedSeats} of ${r.approvedSeats ?? "unlimited"} seats used`;
  }
  return scope;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function requesterName(r: FreeAddRequest) {
  return r.requester?.fullName || r.requester?.username || "Unknown organiser";
}

/**
 * Admin surface: organiser requests to add attendees for free (comp a paid
 * ticket) on a specific event. Backed by `GET /free-attendee-add/requests`;
 * approving flips the event's `allowFreeAttendeeAdd` on.
 */
export default function FreeAddRequestsPage() {
  const [requests, setRequests] = useState<FreeAddRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FreeAddStatus>("PENDING");
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getFreeAddRequests(filter);
    if (res.error) {
      setError(res.error.message || "Could not load free-add requests.");
      setRequests([]);
    } else {
      setRequests(res.data?.requests ?? []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (r: FreeAddRequest, status: "APPROVED" | "REJECTED") => {
    const id = r.id;
    let approvedSeats: number | undefined;
    if (status === "APPROVED") {
      // An approval is a seat quota: every comp of a paid ticket uses one.
      const raw = window.prompt(
        `How many paid seats can ${r.event?.title ?? "this event"} add for free (${r.ticketType ? `${r.ticketType.name} only` : "any ticket"})?`,
        String(r.requestedSeats ?? "")
      );
      if (raw === null) return;
      approvedSeats = Math.trunc(Number(raw));
      if (!(approvedSeats >= 1)) {
        setError("Enter a whole number of seats, 1 or more.");
        return;
      }
    } else if (!window.confirm("Decline this request? This can't be undone.")) {
      return;
    }
    setActing(id);
    const { error } = await reviewFreeAddRequest(id, status, { approvedSeats });
    if (error) {
      setError(error.message || "Could not update the request.");
    } else {
      await load();
    }
    setActing(null);
  };

  const revoke = async (r: FreeAddRequest) => {
    if (!window.confirm(`Revoke the free seats for ${r.event?.title ?? "this event"}? Seats already added stay; no new ones can be added for free.`)) return;
    setActing(r.id);
    const { error } = await revokeFreeAddRequest(r.id);
    if (error) setError(error.message || "Could not revoke the approval.");
    else await load();
    setActing(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Free-add requests"
        subtitle="Approve a number of free seats on a paid ticket (comps) for one event, or revoke them"
      />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Review queue</CardTitle>
              <CardDescription>
                Approving lets the organiser add attendees for free on that event
                (bypassing the payment link) — the platform processing fee is
                waived for those comped seats.
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
              icon={Gift}
              title={filter === "PENDING" ? "The queue is clear" : "Nothing here"}
              description={
                filter === "PENDING"
                  ? "When an organiser asks to add attendees for free, it will land here for review."
                  : `No ${filter.toLowerCase()} free-add requests yet.`
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
                        {r.event?.title ?? "Event"}
                      </p>
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                    {r.space && (
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        Space: {r.space.name}
                      </p>
                    )}
                    {r.reason && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {r.reason}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-foreground">{seatsLine(r)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      <span>By {requesterName(r)}</span>
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
                        onClick={() => decide(r, "REJECTED")}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        disabled={acting === r.id}
                        onClick={() => decide(r, "APPROVED")}
                      >
                        Approve
                      </Button>
                    </div>
                  )}
                  {r.status === "APPROVED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={acting === r.id}
                      onClick={() => revoke(r)}
                    >
                      Revoke
                    </Button>
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
