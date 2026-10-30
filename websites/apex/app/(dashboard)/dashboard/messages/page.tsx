"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  MagnifyingGlass,
  PaperPlaneTilt,
  CheckCircle,
  WarningCircle,
  Prohibit,
  Trash,
  Plus,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { MessageTable } from "@/components/messages/MessageTable";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addSuppression,
  getMessageStats,
  getSuppressions,
  removeSuppression,
  type EmailSuppression,
  type MessageChannel,
  type MessageStats,
} from "@/lib/api/messages-api";

const STATUS_FILTERS = [
  { label: "Problems", value: "FAILED,SUPPRESSED" },
  { label: "Failed", value: "FAILED" },
  { label: "Suppressed", value: "SUPPRESSED" },
  { label: "All", value: "" },
];

const CHANNELS: { label: string; value: MessageChannel | "ALL" }[] = [
  { label: "All channels", value: "ALL" },
  { label: "Email", value: "EMAIL" },
  { label: "WhatsApp", value: "WHATSAPP" },
  { label: "Push", value: "PUSH" },
];

const DAYS = [1, 7, 30];

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Admin surface: the per-message delivery log across push, email and
 * WhatsApp. Opens on failures; the suppression list sits below it.
 */
export default function MessagesPage() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<MessageStats | null>(null);
  const [status, setStatus] = useState("FAILED,SUPPRESSED");
  const [channel, setChannel] = useState<MessageChannel | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const recipient = useDebounced(search.trim());
  const [reloadKey, setReloadKey] = useState(0);

  const loadStats = useCallback(async () => {
    setStats(null);
    const { data } = await getMessageStats(days);
    if (data) setStats(data);
  }, [days]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const sum = useCallback(
    (pred: (s: string) => boolean) =>
      (stats?.counts ?? []).filter((c) => pred(c.status)).reduce((n, c) => n + c.count, 0),
    [stats]
  );

  const statCards = useMemo(
    () => [
      {
        title: "Sent",
        value: sum((s) => ["SENT", "DELIVERED", "OPENED"].includes(s)).toLocaleString("en-IN"),
        hint: `Last ${days} ${days === 1 ? "day" : "days"}`,
        icon: PaperPlaneTilt,
      },
      {
        title: "Delivered or read",
        value: sum((s) => s === "DELIVERED" || s === "OPENED").toLocaleString("en-IN"),
        hint: "Confirmed by the provider",
        icon: CheckCircle,
      },
      {
        title: "Failed",
        value: sum((s) => s === "FAILED").toLocaleString("en-IN"),
        hint: "Provider refused or bounced",
        icon: WarningCircle,
      },
      {
        title: "Suppressed",
        value: sum((s) => s === "SUPPRESSED").toLocaleString("en-IN"),
        hint: `${stats?.suppressions.toLocaleString("en-IN") ?? 0} blocked addresses`,
        icon: Prohibit,
      },
    ],
    [sum, days, stats]
  );

  const refresh = () => {
    loadStats();
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages"
        subtitle="Every push, email and WhatsApp message, and what happened to it"
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Last {d} {d === 1 ? "day" : "days"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refresh}>
              <ArrowClockwise className="h-4 w-4" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <StatCard key={s.title} {...s} loading={!stats} />
        ))}
      </div>

      {stats && (stats.topFailingKinds.length > 0 || stats.topErrors.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopList
            title="Top failing kinds"
            rows={stats.topFailingKinds.map((k) => ({ label: k.kind ?? "No kind", count: k.count }))}
          />
          <TopList
            title="Top errors"
            rows={stats.topErrors.map((e) => ({ label: e.error ?? "No error text", count: e.count }))}
          />
        </div>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="text-base">Delivery log</CardTitle>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Email or phone"
                  className="w-52 pl-9"
                  aria-label="Search recipient"
                />
              </div>
              <Select value={channel} onValueChange={(v) => setChannel(v as MessageChannel | "ALL")}>
                <SelectTrigger className="w-36" aria-label="Channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.label}
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
          <MessageTable
            reloadKey={reloadKey}
            filters={{
              status: status || undefined,
              channel: channel === "ALL" ? undefined : channel,
              recipient: recipient || undefined,
            }}
          />
        </CardContent>
      </Card>

      <SuppressionList onChange={loadStats} />
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing failed.</p>
        ) : (
          rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-foreground">{r.label}</span>
              <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                {r.count.toLocaleString("en-IN")}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

const REASON_TONE = { BOUNCE: "destructive", COMPLAINT: "warning", MANUAL: "neutral" } as const;

/** Addresses no mail goes to (sign-in codes excepted). Removing one lets mail resume. */
function SuppressionList({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<EmailSuppression[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim());
  const [adding, setAdding] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (after?: string) => {
      const { data, error } = await getSuppressions({ search: query || undefined, cursor: after });
      if (error) return setError(error.message || "Could not load the suppression list.");
      setError("");
      setRows((prev) => (after ? [...prev, ...(data?.items ?? [])] : data?.items ?? []));
      setCursor(data?.nextCursor ?? null);
    },
    [query]
  );

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adding.trim()) return;
    setBusy(true);
    const { error } = await addSuppression(adding.trim());
    setBusy(false);
    if (error) return setError(error.message || "Could not add that address.");
    setAdding("");
    load();
    onChange();
  };

  const remove = async (s: EmailSuppression) => {
    const ok = await confirmDialog({
      title: `Remove ${s.address}?`,
      description: "Email to this address starts going out again. If it still bounces, it will be suppressed again.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await removeSuppression(s.id);
    if (error) return setError(error.message || "Could not remove that address.");
    setRows((prev) => prev.filter((r) => r.id !== s.id));
    onChange();
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Email suppression list</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Hard bounces and spam complaints. Nothing but sign-in codes goes to these addresses.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search address"
                className="w-48 pl-9"
                aria-label="Search suppressed addresses"
              />
            </div>
            <form onSubmit={add} className="flex gap-2">
              <Input
                type="email"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                placeholder="Block an address"
                className="w-48"
                aria-label="Address to block"
              />
              <Button type="submit" variant="outline" size="sm" disabled={busy || !adding.trim()}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </form>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div className="p-4">
            <ErrorNotice message={error} />
          </div>
        )}
        {rows.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-muted-foreground">No suppressed addresses.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-foreground">{s.address}</p>
                  <p className="truncate text-xs text-muted-foreground" title={s.details ?? undefined}>
                    {s.source} · {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {s.details ? ` · ${s.details}` : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Badge variant={REASON_TONE[s.reason]}>{s.reason.toLowerCase()}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => remove(s)} aria-label={`Remove ${s.address}`}>
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {cursor && (
          <div className="flex justify-center border-t border-border p-3">
            <Button variant="outline" size="sm" onClick={() => load(cursor)}>
              Load more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
