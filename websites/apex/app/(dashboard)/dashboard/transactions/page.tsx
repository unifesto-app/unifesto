"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlass,
  Receipt,
  CurrencyInr,
  ArrowDownLeft,
  ArrowUpRight,
  CaretRight,
  Buildings,
  Download,
} from "@unifesto/unicon/react";
import {
  getAdminTransactions,
  type LedgerTransaction,
  type TransactionPaymentStatus,
} from "@/lib/api/admin-transactions-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { downloadCsv } from "@/lib/utils/csv";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inr } from "@/lib/utils/money";

const PAGE_SIZE = 20;

const money = inr;

function payer(t: LedgerTransaction): string {
  return t.user.fullName || t.user.username || t.user.email || "Unknown";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

const STATUS_BADGE: Record<
  TransactionPaymentStatus,
  { label: string; variant: "success" | "destructive" | "neutral" | "warning" }
> = {
  PENDING: { label: "Pending", variant: "warning" },
  PAID: { label: "Paid", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  REFUNDED: { label: "Refunded", variant: "neutral" },
  PARTIALLY_REFUNDED: { label: "Partial refund", variant: "warning" },
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [summary, setSummary] = useState({
    grossVolume: 0,
    successful: 0,
    failed: 0,
  });
  const [status, setStatus] = useState<TransactionPaymentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getAdminTransactions({
      page,
      limit: PAGE_SIZE,
      status: status === "all" ? undefined : status,
      search: debouncedSearch.trim() || undefined,
    });
    if (error) setError(error.message);
    else if (data) {
      setTransactions(data.transactions);
      setSummary(data.summary);
      setTotalPages(data.pagination.totalPages || 1);
    }
    setLoading(false);
  }, [page, status, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch]);

  /** Every row matching the current filters, not just this page. */
  const exportCsv = async () => {
    setExporting(true);
    setError("");
    const rows: LedgerTransaction[] = [];
    for (let p = 1; ; p++) {
      const { data, error } = await getAdminTransactions({
        page: p,
        limit: 500,
        status: status === "all" ? undefined : status,
        search: debouncedSearch.trim() || undefined,
      });
      if (error || !data) {
        setError(error?.message ?? "Export failed");
        setExporting(false);
        return;
      }
      rows.push(...data.transactions);
      if (p >= data.pagination.totalPages) break;
    }
    downloadCsv(
      `transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Registered At", "Payer", "Email", "Event", "Space", "Ticket Type", "Amount (INR)", "Processing Fee (INR)", "Refunded (INR)", "Payment Status", "Payment ID", "Order ID", "Paid At"],
      rows.map((t) => [
        t.registeredAt,
        t.user.fullName || t.user.username || "",
        t.user.email,
        t.event.title,
        t.event.space.name,
        t.ticketType?.name ?? "",
        Number(t.totalAmount).toFixed(2),
        Number(t.processingFee).toFixed(2),
        Number(t.refundedAmount).toFixed(2),
        t.paymentStatus,
        t.paymentId,
        t.orderId,
        t.paidAt,
      ])
    );
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        subtitle="Every payment moving through Unifesto"
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting || loading}>
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Gross sales (GMV)"
          value={money(summary.grossVolume)}
          hint="Paid ticket bookings incl. buyer fees; matches Overview"
          icon={CurrencyInr}
          tone="success"
          loading={loading}
        />
        <StatCard
          title="Successful"
          value={summary.successful}
          hint="Completed transactions"
          icon={ArrowDownLeft}
          tone="brand"
          loading={loading}
        />
        <StatCard
          title="Failed"
          value={summary.failed}
          hint="Declined or errored"
          icon={ArrowUpRight}
          loading={loading}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reference, event, or payer"
            className="pl-9"
            aria-label="Search transactions"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as TransactionPaymentStatus | "all")}
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="REFUNDED">Refunded</SelectItem>
            <SelectItem value="PARTIALLY_REFUNDED">Partial refund</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Ledger</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              description="As soon as attendees pay for tickets, every payment will be recorded here."
            />
          ) : (
            <div className="divide-y">
              {transactions.map((t) => {
                const badge = STATUS_BADGE[t.paymentStatus];
                const body = (
                  <>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{payer(t)}</p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.event.title}
                        {t.ticketType ? ` · ${t.ticketType.name}` : ""}
                      </p>
                      {t.event.space && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <Buildings className="h-3.5 w-3.5 flex-shrink-0" />
                          {t.event.space.name}
                        </p>
                      )}
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatDate(t.paidAt || t.registeredAt)}
                        {t.paymentId && (
                          <span className="ml-2 font-mono">{t.paymentId}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {money(t.totalAmount)}
                        </p>
                        {Number(t.refundedAmount) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {money(t.refundedAmount)} refunded
                          </p>
                        )}
                      </div>
                      <CaretRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    </div>
                  </>
                );

                const rowClass =
                  "flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between";

                return (
                  <Link
                    key={t.id}
                    href={`/dashboard/transactions/${t.id}`}
                    className={`${rowClass} transition-colors hover:bg-muted/50`}
                  >
                    {body}
                  </Link>
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
    </div>
  );
}
