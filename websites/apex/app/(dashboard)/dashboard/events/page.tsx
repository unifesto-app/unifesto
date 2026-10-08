"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlass,
  CalendarBlank,
  Ticket,
  CurrencyInr,
  Stack,
} from "@unifesto/unicon/react";
import {
  getAllEventsAdmin,
  type AdminEvent,
  type AdminEventStatus,
} from "@/lib/api/admin-events-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
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

const PAGE_SIZE = 20;
const money = (v: number | string) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS: Record<AdminEventStatus, { label: string; variant: "success" | "neutral" | "warning" | "destructive" | "brand" }> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  PUBLISHED: { label: "Published", variant: "success" },
  ONGOING: { label: "Ongoing", variant: "brand" },
  COMPLETED: { label: "Completed", variant: "neutral" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

const STATUS_OPTIONS: { value: AdminEventStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ONGOING", label: "Ongoing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DRAFT", label: "Draft" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function AdminEventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [status, setStatus] = useState<AdminEventStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getAllEventsAdmin({
      page,
      limit: PAGE_SIZE,
      status: status === "all" ? undefined : status,
      search: debounced.trim() || undefined,
    });
    if (error) setError(error.message);
    else if (data) {
      setEvents(data.events);
      setTotalPages(data.pagination.totalPages || 1);
      setSummaryTotal(data.pagination.total);
    }
    setLoading(false);
  }, [page, status, debounced]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, debounced]);

  const pageSales = useMemo(
    () => events.reduce((sum, e) => sum + e.sales.grossSales, 0),
    [events]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        subtitle={`${summaryTotal.toLocaleString("en-IN")} events across the platform`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Total events" value={summaryTotal} icon={CalendarBlank} loading={loading} />
        <StatCard title="Sales (this page)" value={money(pageSales)} hint="Gross of shown events" icon={CurrencyInr} tone="success" loading={loading} />
        <StatCard title="Showing" value={events.length} hint={`Page ${page} of ${totalPages}`} icon={Ticket} loading={loading} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or slug" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as AdminEventStatus | "all")}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton />
          ) : events.length === 0 ? (
            <EmptyState icon={CalendarBlank} title="No events found" description="Try clearing the search or choosing a different status." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="py-3 pl-4 pr-4 font-medium">#</th>
                    <th className="py-3 pr-4 font-medium">Event</th>
                    <th className="py-3 pr-4 font-medium">Curator</th>
                    <th className="py-3 pr-4 font-medium">Space</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 text-right font-medium">Registered</th>
                    <th className="py-3 pr-4 text-right font-medium">Gross sales</th>
                    <th className="py-3 pr-4 font-medium">Starts</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => {
                    const s = STATUS[e.status];
                    const organiser = e.creator.fullName || e.creator.username || "Curator";
                    return (
                      <tr
                        key={e.id}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="py-3 pl-4 pr-4 text-muted-foreground tabular-nums">
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </td>
                        <td className="py-3 pr-4">
                          <Link href={`/dashboard/events/${e.id}`} className="block min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-foreground hover:underline">{e.title}</span>
                              {(e._count?.childEvents ?? 0) > 0 && (
                                <Badge variant="brand">
                                  <Stack className="mr-1 h-3 w-3" weight="fill" />
                                  Big event · {e._count.childEvents}
                                </Badge>
                              )}
                              {e.parentEvent && (
                                <Badge variant="neutral">
                                  <Stack className="mr-1 h-3 w-3" />
                                  Sub-event
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {e.city ? `${e.city} · ` : ""}{e.type.replace(/_/g, " ").toLowerCase()}
                            </p>
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          <p className="truncate text-foreground">{organiser}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {e.creator.email || e.creator.mobileNumber || "—"}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{e.space?.name ?? "—"}</td>
                        <td className="py-3 pr-4"><Badge variant={s.variant}>{s.label}</Badge></td>
                        <td className="py-3 pr-4 text-right tabular-nums text-foreground">
                          {e.registeredCount.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-foreground">
                          {money(e.sales.grossSales)}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{fmt(e.startDateTime)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-6" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
