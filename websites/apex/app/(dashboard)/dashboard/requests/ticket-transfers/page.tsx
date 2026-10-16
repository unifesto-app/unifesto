"use client";

import { useCallback, useEffect, useState } from "react";
import { Ticket } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getTransferRequests,
  reviewTransferRequest,
  type TransferRequest,
} from "@/lib/api/registrations-api";
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
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function holderName(r: TransferRequest) {
  const u = r.registration?.user;
  return u?.fullName || u?.username || "Unknown";
}

function holderEmail(r: TransferRequest) {
  return r.registration?.user?.identities?.[0]?.email ?? "";
}

/**
 * Admin surface: organiser requests to transfer a registration to another
 * account. Approving performs the transfer (to the possibly-edited target
 * email); the admin can also transfer directly from the attendee record.
 */
export default function TicketTransfersPage() {
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<RequestStatus>("PENDING");
  const [acting, setActing] = useState<string | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getTransferRequests(filter);
    if (res.error) {
      setError(res.error.message || "Could not load transfer requests.");
      setRequests([]);
    } else {
      const rows = res.data?.requests ?? [];
      setRequests(rows);
      setEmails(
        Object.fromEntries(rows.map((r) => [r.id, r.targetEmail]))
      );
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (
    r: TransferRequest,
    status: "APPROVED" | "REJECTED"
  ) => {
    if (!window.confirm(`${status === "APPROVED" ? "Approve" : "Decline"} this request? This can't be undone.`)) return;
    setActing(r.id);
    setError("");
    const { error } = await reviewTransferRequest(r.id, status, {
      email: status === "APPROVED" ? emails[r.id] : undefined,
    });
    if (error) {
      setError(error.message || "Could not update the request.");
    } else {
      await load();
    }
    setActing(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ticket transfers"
        subtitle="Review organiser requests to move a registration to another account"
      />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Review queue</CardTitle>
              <CardDescription>
                Approving reassigns the ticket to the target account (edit the
                email first if needed). The account must already exist and not be
                registered for the event.
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
              icon={Ticket}
              title={filter === "PENDING" ? "The queue is clear" : "Nothing here"}
              description={
                filter === "PENDING"
                  ? "When an organiser requests a ticket transfer, it lands here."
                  : `No ${filter.toLowerCase()} transfer requests yet.`
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id} className="space-y-3 px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-foreground">
                      {r.registration?.event?.title ?? "Event"}
                    </p>
                    <Badge variant={STATUS_VARIANT[r.status]}>
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </Badge>
                    {r.registration?.ticketType && (
                      <Badge variant="outline">
                        {r.registration.ticketType.name}
                      </Badge>
                    )}
                    {(r.registration?.groupSize ?? 0) > 1 && (
                      <Badge variant="outline">
                        Group of {r.registration!.groupSize}
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <p>
                      From{" "}
                      <span className="text-foreground">{holderName(r)}</span>
                      {holderEmail(r) && ` (${holderEmail(r)})`}
                    </p>
                    <p>
                      Requested by{" "}
                      <span className="text-foreground">
                        {r.requester?.fullName || r.requester?.username || "—"}
                      </span>{" "}
                      on {formatDate(r.createdAt)}
                    </p>
                  </div>

                  {r.reason && (
                    <p className="text-sm text-muted-foreground">
                      Reason: {r.reason}
                    </p>
                  )}
                  {r.reviewNote && r.status !== "PENDING" && (
                    <p className="text-sm italic text-muted-foreground">
                      Note: {r.reviewNote}
                    </p>
                  )}

                  {r.status === "PENDING" ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-1">
                        <label
                          htmlFor={`email-${r.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Transfer to
                        </label>
                        <Input
                          id={`email-${r.id}`}
                          type="email"
                          value={emails[r.id] ?? ""}
                          onChange={(e) =>
                            setEmails((m) => ({ ...m, [r.id]: e.target.value }))
                          }
                        />
                      </div>
                      <div className="flex gap-2">
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
                          disabled={acting === r.id || !emails[r.id]?.trim()}
                          onClick={() => decide(r, "APPROVED")}
                        >
                          Approve &amp; transfer
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Target: {r.targetEmail}
                    </p>
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
