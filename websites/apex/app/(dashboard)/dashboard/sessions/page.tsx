"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlass,
  VideoCamera,
  Copy,
  Buildings,
  User,
  Clock,
  CurrencyInr,
} from "@unifesto/unicon/react";
import {
  getAllSessionsAdmin,
  PLATFORM_LABELS,
  type AdminSession,
  type AdminSessionStatus,
} from "@/lib/api/admin-sessions-api";
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
import { inr } from "@/lib/utils/money";

const PAGE_SIZE = 20;
const money = inr;
const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const STATUS: Record<
  AdminSessionStatus,
  { label: string; variant: "success" | "neutral" | "warning" | "destructive" | "brand" }
> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  PUBLISHED: { label: "Published", variant: "success" },
  COMPLETED: { label: "Completed", variant: "neutral" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

const STATUS_OPTIONS: { value: AdminSessionStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "PUBLISHED", label: "Published" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DRAFT", label: "Draft" },
  { value: "CANCELLED", label: "Cancelled" },
];

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      title="Copy ID"
    >
      {copied ? "Copied!" : id}
      <Copy className="h-3 w-3" />
    </button>
  );
}

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [status, setStatus] = useState<AdminSessionStatus | "all">("all");
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
    const { data, error } = await getAllSessionsAdmin({
      page,
      limit: PAGE_SIZE,
      status: status === "all" ? undefined : status,
      search: debounced.trim() || undefined,
    });
    if (error) setError(error.message);
    else if (data) {
      setSessions(data.sessions);
      setTotalPages(data.pagination.totalPages || 1);
      setSummaryTotal(data.pagination.total);
    }
    setLoading(false);
  }, [page, status, debounced]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [status, debounced]);

  const pageSales = useMemo(
    () => sessions.reduce((sum, s) => sum + s.sales.grossSales, 0),
    [sessions]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sessions"
        subtitle={`${summaryTotal.toLocaleString("en-IN")} sessions across the platform`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Total sessions" value={summaryTotal} icon={VideoCamera} loading={loading} />
        <StatCard title="Sales (this page)" value={money(pageSales)} hint="Gross of shown sessions" icon={CurrencyInr} tone="success" loading={loading} />
        <StatCard title="Showing" value={sessions.length} hint={`Page ${page} of ${totalPages}`} icon={VideoCamera} loading={loading} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or slug" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as AdminSessionStatus | "all")}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={VideoCamera} title="No sessions found" description="Try clearing the search or choosing a different status." />
      ) : (
        <div className="space-y-4">
          {sessions.map((s) => {
            const st = STATUS[s.status];
            const organiser = s.creator.fullName || s.creator.username || "Curator";
            const platform = s.platform === "OTHER" ? s.platformOther || "Online" : PLATFORM_LABELS[s.platform];
            const price = Number(s.price);
            return (
              <Link key={s.id} href={`/dashboard/sessions/${s.id}`}>
                <Card className="transition-colors hover:border-border-strong">
                  <CardContent className="space-y-4 p-4">
                    {/* Title + status + sales */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{s.title}</p>
                          <Badge variant={st.variant}>{st.label}</Badge>
                          <Badge variant="neutral">{price > 0 ? money(price) : "Free"}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>Session ID:</span> <CopyId id={s.id} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{money(s.sales.grossSales)}</p>
                        <p className="text-xs text-muted-foreground">{s.sales.paidRegistrations} paid</p>
                      </div>
                    </div>

                    {/* Curator + space */}
                    <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-2">
                      <div className="flex items-start gap-1.5">
                        <User className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-foreground">{organiser}</p>
                          <p className="text-muted-foreground">{s.creator.email || s.creator.mobileNumber || "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <Buildings className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-foreground">{s.space?.name ?? "—"}</p>
                          <p className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" /> {fmt(s.startDateTime)} · {s.durationMinutes} min · {platform}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
                      <Stat label="Registered" value={s.registeredCount.toLocaleString("en-IN")} />
                      <Stat label="Paid regs" value={s.sales.paidRegistrations.toLocaleString("en-IN")} />
                      <Stat label="Gross sales" value={money(s.sales.grossSales)} />
                      <Stat label="Refunded" value={money(s.sales.refunded)} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
