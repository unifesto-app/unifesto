"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Hourglass, MagnifyingGlass } from "@unifesto/unicon/react";
import {
  getEventWaitlist,
  getWaitlistSummary,
  allowFromWaitlist,
  allowNextFromWaitlist,
  revokeFromWaitlist,
  type WaitlistEntry,
  type WaitlistSummaryRow,
  type WaitlistStatus,
} from "@/console/lib/api/waitlist-api";
import { EventExportMenu } from "@/console/components/shared/EventExportMenu";
import { Pager } from "@/console/components/shared/ListControls";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";

const STATUS_LABEL: Record<WaitlistStatus, string> = {
  WAITING: "Waiting",
  OFFERED: "Offered",
  CONVERTED: "Confirmed",
  EXPIRED: "Expired",
  DECLINED: "Declined",
};

const STATUS_VARIANT: Record<
  WaitlistStatus,
  "neutral" | "success" | "warning" | "destructive"
> = {
  WAITING: "neutral",
  OFFERED: "warning",
  CONVERTED: "success",
  EXPIRED: "destructive",
  DECLINED: "destructive",
};

export default function EventWaitlistPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [summary, setSummary] = useState<WaitlistSummaryRow[]>([]);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [ticketTypeId, setTicketTypeId] = useState<string>("all");
  const [status, setStatus] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    const [sum, list] = await Promise.all([
      getWaitlistSummary(eventId),
      getEventWaitlist(eventId, {
        ticketTypeId: ticketTypeId === "all" ? undefined : ticketTypeId,
        status: status === "active" ? undefined : (status as WaitlistStatus),
        search: search.trim() || undefined,
        page,
        limit: 50,
      }),
    ]);
    if (sum.error) setError(sum.error.message);
    else setSummary(sum.data ?? []);
    if (list.error) setError(list.error.message);
    else {
      setEntries(list.data?.data ?? []);
      setTotalPages(list.data?.meta.totalPages || 1);
    }
    setLoading(false);
  }, [eventId, ticketTypeId, status, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Ticket types that actually have the waiting list switched on. */
  const enabled = useMemo(
    () => summary.filter((s) => s.waitlistEnabled),
    [summary]
  );

  const allow = async (entry: WaitlistEntry) => {
    setBusyId(entry.registrationId);
    setError("");
    setNotice("");
    const { data, error } = await allowFromWaitlist(
      eventId,
      entry.registrationId
    );
    setBusyId(null);
    if (error) {
      setError(error.message);
      return;
    }
    const who = entry.user.fullName || entry.user.username || "They";
    setNotice(
      data?.needsPayment
        ? `${who} has been let in. Their seat is held until they pay ₹${data.amountDue}. Revoke the offer if they never do.`
        : `${who} is confirmed. The ticket is free, so there was nothing to pay.`
    );
    await load();
  };

  const revoke = async (entry: WaitlistEntry) => {
    const who = entry.user.fullName || entry.user.username || "this person";
    if (
      !window.confirm(
        `Revoke the offer for ${who}? Their held seat goes back to the pool and the offer cannot be reinstated.`
      )
    ) {
      return;
    }
    setBusyId(entry.registrationId);
    setError("");
    setNotice("");
    const { error } = await revokeFromWaitlist(eventId, entry.registrationId);
    setBusyId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(`Offer for ${who} revoked. The seat is free again.`);
    await load();
  };

  const allowNext = async (row: WaitlistSummaryRow, count: number) => {
    setBusyId(row.ticketTypeId);
    setError("");
    setNotice("");
    const { data, error } = await allowNextFromWaitlist(
      eventId,
      row.ticketTypeId,
      count
    );
    setBusyId(null);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setNotice(
        data.offeredCount < data.requested
          ? `Let in ${data.offeredCount} of ${data.requested}. The rest could not fit in the seats that are free.`
          : `Let in ${data.offeredCount} from the ${row.name} queue.`
      );
    }
    await load();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Waiting list"
        subtitle="People queued for a sold-out ticket. Letting someone in holds their seat until they pay, with no time limit. Revoke an offer to free the seat if they never do."
        actions={<EventExportMenu eventId={eventId} type="waitlist" />}
      />

      {error && <ErrorNotice message={error} />}
      {notice && (
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] px-4 py-3 text-sm text-foreground">
          {notice}
        </div>
      )}

      {enabled.length === 0 ? (
        <EmptyState
          icon={Hourglass}
          title="No waiting lists yet"
          description="Turn on the waiting list for a ticket that has a capacity, and buyers will queue instead of being turned away once it sells out."
        />
      ) : (
        <>
          {/* Per-ticket summary and the batch action. */}
          <div className="grid gap-4 sm:grid-cols-2">
            {enabled.map((row) => (
              <SummaryCard
                key={row.ticketTypeId}
                row={row}
                busy={busyId === row.ticketTypeId}
                onAllowNext={(n) => allowNext(row, n)}
              />
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative min-w-[220px] flex-1">
              <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, email or phone"
                className="pl-9"
              />
            </div>
            <Select
              value={ticketTypeId}
              onValueChange={(v) => {
                setTicketTypeId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tickets</SelectItem>
                {enabled.map((s) => (
                  <SelectItem key={s.ticketTypeId} value={s.ticketTypeId}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Waiting &amp; offered</SelectItem>
                <SelectItem value="WAITING">Waiting</SelectItem>
                <SelectItem value="OFFERED">Offered</SelectItem>
                <SelectItem value="CONVERTED">Confirmed</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="DECLINED">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {entries.length === 0 ? (
            <EmptyState
              icon={Hourglass}
              title="Nobody here"
              description="No one matches these filters."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {entries.map((e) => (
                    <EntryRow
                      key={e.registrationId}
                      entry={e}
                      busy={busyId === e.registrationId}
                      onAllow={() => allow(e)}
                      onRevoke={() => revoke(e)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Pager page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function SummaryCard({
  row,
  busy,
  onAllowNext,
}: {
  row: WaitlistSummaryRow;
  busy: boolean;
  onAllowNext: (count: number) => void;
}) {
  const [count, setCount] = useState("1");
  const free = row.seatsAvailable ?? 0;
  // Nothing to give out, or nobody to give it to.
  const canAllow = free > 0 && row.waiting > 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {row.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.isPaid ? `₹${row.price}` : "Free"} ·{" "}
              {row.soldCount}/{row.capacity ?? "∞"} taken
            </p>
          </div>
          <Badge variant={free > 0 ? "success" : "neutral"}>
            {free > 0 ? `${free} free` : "Full"}
          </Badge>
        </div>

        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{row.waiting}</strong> waiting
          </span>
          <span>
            <strong className="text-foreground">{row.offered}</strong> offered
          </span>
          <span>
            <strong className="text-foreground">{row.converted}</strong> confirmed
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={Math.max(1, Math.min(free || 1, row.waiting || 1))}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-20"
            disabled={!canAllow}
          />
          <Button
            size="sm"
            disabled={!canAllow || busy}
            onClick={() => onAllowNext(Number(count) || 1)}
          >
            {busy ? "Working…" : "Let next in"}
          </Button>
        </div>

        {!canAllow && (
          <p className="text-xs text-muted-foreground">
            {row.waiting === 0
              ? "Nobody is waiting for this ticket."
              : "No seats are free. A seat must open up before you can let anyone in."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EntryRow({
  entry,
  busy,
  onAllow,
  onRevoke,
}: {
  entry: WaitlistEntry;
  busy: boolean;
  onAllow: () => void;
  onRevoke: () => void;
}) {
  const name = entry.user.fullName || entry.user.username || "Unnamed";
  const isWaiting = entry.waitlistStatus === "WAITING";
  const isOffered = entry.waitlistStatus === "OFFERED";

  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-8 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {isWaiting ? `#${entry.position}` : "—"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {name}
            {entry.seats > 1 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                group of {entry.seats}
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {entry.user.email ?? entry.user.mobileNumber ?? "No contact"}
            {entry.ticketType ? ` · ${entry.ticketType.name}` : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {isOffered && (
          <span className="text-right text-xs text-muted-foreground">
            {entry.amountDue ? `₹${entry.amountDue} due` : "Confirming"}
            <br />
            seat held
          </span>
        )}
        <Badge variant={STATUS_VARIANT[entry.waitlistStatus]}>
          {STATUS_LABEL[entry.waitlistStatus]}
        </Badge>
        {isWaiting && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onAllow}>
            {busy ? "Working…" : "Allow"}
          </Button>
        )}
        {isOffered && entry.amountDue ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onRevoke}
          >
            {busy ? "Working…" : "Revoke"}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
