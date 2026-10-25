"use client";

import { inr } from "@/lib/utils/money";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  CaretRight as CaretRightIcon,
  CurrencyInr,
  Clock,
  ArrowCounterClockwise,
  Receipt,
} from "@unifesto/unicon/react";
import { getEventById } from "@/lib/api/events-api";
import { getEventTransactions, type EventTransactions } from "@/lib/api/payouts-api";
import {
  getAllEventRegistrations,
  exportRegistrations,
  EXPORT_EXTENSION,
} from "@/lib/api/registrations-api";
import { ExportMenu } from "@/components/shared/ExportMenu";
import type { Event } from "@/lib/api/events-api";
import type {
  Registration,
  PaymentStatus,
  ExportFormat,
} from "@/lib/api/registrations-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { RequestPayoutDialog } from "@/components/finance/PayoutsPanel";
import { useAccess } from "@/lib/context/SessionContext";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const ITEMS_PER_PAGE = 20;

/** ₹ formatting, matching the attendee views (amounts are stored in rupees). */
function money(value: number): string {
  return inr(value);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

/**
 * A registration counts as a transaction only when money was actually involved:
 * a non-zero amount, or a payment/order id from the gateway. Free RSVPs are
 * excluded so the financial view isn't padded with ₹0 rows.
 */
function isTransaction(reg: Registration): boolean {
  return reg.totalAmount > 0 || !!reg.paymentId || !!reg.orderId;
}

function paymentBadgeVariant(status: PaymentStatus) {
  switch (status) {
    case "PAID":
      return "success" as const;
    case "FAILED":
    case "REFUNDED":
      return "destructive" as const;
    default:
      return "neutral" as const;
  }
}

export default function EventTransactionsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [transactions, setTransactions] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">("all");
  const [ticketFilter, setTicketFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const { can } = useAccess(eventId);
  // Whether this space's plan includes bulk export (the flag the backend
  // enforces with). `undefined` until access loads; ExportMenu stays live then.
  const exportAccess = useAccess(eventId);
  const canExport = exportAccess.access ? exportAccess.hasFeature("hasBulkExport") : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [eventResult, regResult] = await Promise.all([
      getEventById(eventId),
      getAllEventRegistrations(eventId),
    ]);
    if (eventResult.data) {
      setEvent(eventResult.data);
    }
    if (regResult.error) setError(regResult.error.message);
    else setTransactions((regResult.data ?? []).filter(isTransaction));
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, paymentFilter, ticketFilter]);

  // Summary reflects the ticket-type filter (but not the payment-status filter,
  // since the tiles already break the money down by status, nor the search box).
  const summaryTxns = useMemo(
    () =>
      ticketFilter === "all"
        ? transactions
        : transactions.filter((t) => t.ticketTypeId === ticketFilter),
    [transactions, ticketFilter]
  );
  // Tiles come from the server's settle(), so Net carries each sale's
  // organiser fee exactly as payouts do (T6).
  const [summary, setSummary] = useState<EventTransactions | null>();
  useEffect(() => {
    let live = true;
    void getEventTransactions(
      eventId,
      ticketFilter === "all" ? undefined : ticketFilter
    ).then((r) => {
      if (!live) return;
      setSummary(r.data);
      if (r.error) setError(r.error.message);
    });
    return () => {
      live = false;
    };
  }, [eventId, ticketFilter]);

  // The table applies every filter, including status and the free-text search.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summaryTxns.filter((t) => {
      if (paymentFilter !== "all" && t.paymentStatus !== paymentFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [t.user.fullName, t.user.username, t.user.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [summaryTxns, paymentFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const pageItems = filtered.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const handleExport = async (format: ExportFormat) => {
    setExporting(true);
    const { data, error } = await exportRegistrations(
      eventId,
      format,
      "transactions"
    );
    if (error) {
      alert(error.message);
    } else if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${event?.slug || eventId}-transactions.${EXPORT_EXTENSION[format]}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  };

  const hasFilters =
    search.trim() !== "" || paymentFilter !== "all" || ticketFilter !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        subtitle="View payment transactions and refunds"
        actions={
          <div className="flex flex-wrap gap-2">
            {event && can("event:manage-money") && (
              <Button variant="outline" onClick={() => setPayoutOpen(true)}>
                Request payout
              </Button>
            )}
            <ExportMenu
              onExport={handleExport}
              exporting={exporting}
              disabled={loading || transactions.length === 0}
              canExport={canExport}
            />
          </div>
        }
      />
      <RequestPayoutDialog target={payoutOpen && event ? { kind: "event", id: event.id, title: event.title } : null} onClose={() => setPayoutOpen(false)} onDone={() => setPayoutOpen(false)} />

      {error && <ErrorNotice message={error} />}

      {/* Financial summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Collected"
          value={money(summary?.collected ?? 0)}
          hint={`${summary?.paidCount ?? 0} paid · ${money(
            summary?.buyerFees ?? 0
          )} buyer fees`}
          icon={CurrencyInr}
          tone="success"
          loading={summary === undefined}
        />
        <StatCard
          title="Net revenue"
          value={money(summary?.net ?? 0)}
          hint={`After refunds, buyer fees and ${money(summary?.platformFee ?? 0)} platform fee`}
          icon={Receipt}
          tone="brand"
          loading={summary === undefined}
        />
        <StatCard
          title="Pending"
          value={money(summary?.pending ?? 0)}
          hint="Awaiting payment"
          icon={Clock}
          loading={summary === undefined}
        />
        <StatCard
          title="Refunded"
          value={money(summary?.refunded ?? 0)}
          hint="Returned to attendees"
          icon={ArrowCounterClockwise}
          loading={summary === undefined}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
        <Select
          value={paymentFilter}
          onValueChange={(v) => setPaymentFilter(v as PaymentStatus | "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="REFUNDED">Refunded</SelectItem>
          </SelectContent>
        </Select>
        {event?.ticketTypes && event.ticketTypes.length > 0 && (
          <Select value={ticketFilter} onValueChange={setTicketFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ticket types</SelectItem>
              {event.ticketTypes.map((tt) => (
                <SelectItem key={tt.id} value={tt.id}>
                  {tt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Receipt}
              title={hasFilters ? "No transactions match" : "No transactions yet"}
              description={
                hasFilters
                  ? "Try a different search, or clear the filters."
                  : "Paid registrations show up here once tickets sell."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {pageItems.map((t) => (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      router.push(
                        `/dashboard/events/${eventId}/attendees/${t.id}`
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(
                          `/dashboard/events/${eventId}/attendees/${t.id}`
                        );
                      }
                    }}
                    className="flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {t.user.fullName || t.user.username || "Unknown"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.user.email || t.user.username}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(t.paidAt || t.registeredAt)}
                        </span>
                        {t.ticketType && (
                          <Badge variant="outline" className="text-xs">
                            {t.ticketType.name}
                          </Badge>
                        )}
                        {t.paymentId && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {t.paymentId}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <Badge variant={paymentBadgeVariant(t.paymentStatus)}>
                        {t.paymentStatus}
                      </Badge>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {money(t.totalAmount)}
                        </p>
                        {t.processingFee > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {money(t.processingFee)} fee
                          </p>
                        )}
                      </div>
                      <CaretRightIcon className="hidden h-4 w-4 flex-shrink-0 text-muted-foreground sm:block" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {filtered.length.toLocaleString(
                  "en-IN"
                )}{" "}
                {filtered.length === 1 ? "transaction" : "transactions"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <CaretLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <CaretRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
