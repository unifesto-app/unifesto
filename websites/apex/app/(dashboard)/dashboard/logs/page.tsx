"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ListChecks,
  MagnifyingGlass,
  ArrowClockwise,
  Pulse,
  Warning,
  Timer,
  Database,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getLogs,
  getLogStats,
  statusTone,
  type ApiLog,
  type LogStats,
  type LogStatusFilter,
} from "@/lib/api/logs-api";

const STATUS_FILTERS: { label: string; value: LogStatusFilter | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Success", value: "success" },
  { label: "4xx", value: "client_error" },
  { label: "5xx", value: "server_error" },
];

const METHODS = ["ALL", "GET", "POST", "PATCH", "PUT", "DELETE"];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "text-blue-600";
    case "POST":
      return "text-green-600";
    case "PATCH":
    case "PUT":
      return "text-amber-600";
    case "DELETE":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Admin surface: request log for api.unifesto.app — every call the backend
 * handled, with status, latency, and who made it. Backed by `GET /admin/logs`.
 */
export default function LogsPage() {
  const { role } = useSession();
  const isAdmin = role === "platform_admin";

  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LogStatusFilter | "ALL">("ALL");
  const [method, setMethod] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    const { data } = await getLogStats();
    if (data) setStats(data);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getLogs({
      status: status === "ALL" ? undefined : status,
      method: method === "ALL" ? undefined : method,
      search: search.trim() || undefined,
      page,
      limit: 50,
    });
    if (error) {
      setError(error.message || "Could not load logs.");
      setLogs([]);
    } else {
      setLogs(data?.logs ?? []);
      setTotal(data?.pagination?.total ?? 0);
      setTotalPages(data?.pagination?.totalPages ?? 1);
    }
    setLoading(false);
  }, [status, method, search, page]);

  useEffect(() => {
    if (isAdmin) loadLogs();
  }, [isAdmin, loadLogs]);

  useEffect(() => {
    if (isAdmin) loadStats();
  }, [isAdmin, loadStats]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [status, method, search]);

  const refresh = () => {
    loadLogs();
    loadStats();
  };

  const statCards = useMemo(
    () => [
      {
        title: "Requests (24h)",
        value: stats?.last24h.toLocaleString() ?? "0",
        hint: `${stats?.total.toLocaleString() ?? 0} total`,
        icon: Pulse,
        tone: "neutral" as const,
      },
      {
        title: "Errors (24h)",
        value: stats?.errors24h.toLocaleString() ?? "0",
        hint: "4xx & 5xx",
        icon: Warning,
        tone: "neutral" as const,
      },
      {
        title: "Avg latency",
        value: `${stats?.avgDurationMs ?? 0} ms`,
        hint: "Last 24h",
        icon: Timer,
        tone: "neutral" as const,
      },
      {
        title: "Retained",
        value: "14 days",
        hint: "Auto-pruned",
        icon: Database,
        tone: "neutral" as const,
      },
    ],
    [stats]
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Activity logs" />
        <EmptyState
          icon={ListChecks}
          title="Admins only"
          description="API logs are visible to platform staff."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API logs"
        subtitle="Every request handled by api.unifesto.app"
        actions={
          <Button variant="outline" size="sm" onClick={refresh}>
            <ArrowClockwise className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <StatCard key={s.title} {...s} loading={!stats} />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Requests</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Path, IP, or status"
                  className="w-52 pl-9"
                  aria-label="Search logs"
                />
              </div>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-28" aria-label="Method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m === "ALL" ? "All methods" : m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setStatus(f.value)}
                    className={
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                      (status === f.value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {f.label}
                  </button>
                ))}
              </div>
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
            <div className="space-y-px p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No requests match"
              description="Try widening the filters, or wait for new traffic to come in."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Method</th>
                    <th className="px-3 py-2.5 font-medium">Path</th>
                    <th className="px-3 py-2.5 font-medium">Latency</th>
                    <th className="px-3 py-2.5 font-medium">IP</th>
                    <th className="px-4 py-2.5 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-xs">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Badge variant={statusTone(log.statusCode)}>
                          {log.statusCode}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`font-semibold ${methodColor(log.method)}`}
                        >
                          {log.method}
                        </span>
                      </td>
                      <td
                        className="max-w-[28rem] truncate px-3 py-2.5 text-foreground"
                        title={
                          log.errorMessage
                            ? `${log.path} — ${log.errorMessage}`
                            : log.path
                        }
                      >
                        {log.path}
                        {log.errorMessage && (
                          <span className="ml-2 text-destructive">
                            {log.errorMessage}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {log.durationMs} ms
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {log.ipAddress ?? "—"}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground"
                        title={fullTime(log.createdAt)}
                      >
                        {timeAgo(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total.toLocaleString()} requests
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
