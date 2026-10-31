"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CheckCircle,
  WarningCircle,
  XCircle,
  Plus,
  Megaphone,
  Question,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import {
  getExternalStatus,
  getSentryIssues,
  resolveSentryIssue,
  reconcileSeatCounts,
  type ExternalMonitor,
  type ExternalStatus,
  type SentryIssues,
} from "@/lib/api/platform-tools-api";
import {
  getStatusSummary,
  createIncident,
  updateIncident,
  INCIDENT_STATUS_LABEL,
  INCIDENT_IMPACT_LABEL,
  type StatusSummary,
  type StatusServiceEntry,
  type DayStatus,
  type Incident,
  type IncidentImpact,
  type IncidentStatus,
} from "@/lib/api/status-api";

const REFRESH_MS = 30_000;
const IMPACTS: IncidentImpact[] = ["MINOR", "MAJOR", "CRITICAL", "NONE"];
const STATUSES: IncidentStatus[] = [
  "INVESTIGATING",
  "IDENTIFIED",
  "MONITORING",
  "RESOLVED",
];

function dayColor(status: DayStatus): string {
  switch (status) {
    case "up":
      return "bg-success";
    case "down":
      return "bg-destructive";
    case "partial":
      return "bg-warning";
    default:
      return "bg-muted";
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Public-status-page style board for admins: overall banner, per-service 90-day
 * uptime bars, and incidents. Backed by `/admin/status`.
 */
export default function StatusPage() {
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getStatusSummary();
    setLoading(false);
    if (error) {
      setError(error.message || "Could not load status.");
      return;
    }
    setError("");
    setSummary(data);
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  // No summary yet means we don't know, not that everything is fine.
  const overall = summary?.overall ?? "unknown";
  const banner =
    overall === "operational"
      ? { text: "All systems operational", tone: "up" as const }
      : overall === "degraded"
        ? { text: "Some systems degraded", tone: "degraded" as const }
        : overall === "major_outage"
          ? { text: "Major outage", tone: "down" as const }
          : { text: "Status unknown", tone: "unknown" as const };
  const bannerCls =
    banner.tone === "up"
      ? { soft: "bg-success-soft", text: "text-success", Icon: CheckCircle }
      : banner.tone === "degraded"
        ? { soft: "bg-warning-soft", text: "text-warning", Icon: WarningCircle }
        : banner.tone === "down"
          ? { soft: "bg-destructive-soft", text: "text-destructive", Icon: XCircle }
          : { soft: "bg-muted", text: "text-muted-foreground", Icon: Question };
  const bannerSub = !summary
    ? ""
    : summary.stale
      ? summary.lastSampleAt
        ? `No health check since ${new Date(summary.lastSampleAt).toLocaleString("en-IN")}. The sampler or its database may be down.`
        : "No health checks recorded yet."
      : `Updated ${new Date(summary.updatedAt).toLocaleTimeString("en-IN")} · auto-refreshing`;
  const openCount =
    summary?.incidents.filter((i) => i.status !== "RESOLVED").length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Status"
        subtitle="Live service health & uptime for Unifesto"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setReporting(true)}>
              <Megaphone className="h-4 w-4" /> Report incident
            </Button>
            <Button aria-label="Refresh" variant="ghost" size="sm" onClick={load}>
              <ArrowsClockwise className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {error && <ErrorNotice message={error} />}

      {reporting && (
        <IncidentForm
          services={summary?.services ?? []}
          onClose={() => setReporting(false)}
          onSaved={() => {
            setReporting(false);
            load();
          }}
        />
      )}

      {loading && !summary ? (
        <>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </>
      ) : (
        <>
          {/* Overall banner */}
          <Card className={cn("border-0", bannerCls.soft)}>
            <CardContent className="flex items-center gap-4 p-6">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-card">
                <bannerCls.Icon
                  className={cn("h-7 w-7", bannerCls.text)}
                  weight="fill"
                />
              </span>
              <div className="flex-1">
                <p className={cn("text-lg font-semibold", bannerCls.text)}>
                  {banner.text}
                </p>
                <p className="text-sm text-muted-foreground">{bannerSub}</p>
                {openCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {openCount} open incident{openCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Services with 90-day uptime bars */}
          <div>
            <h2 className="mb-1 text-base font-semibold text-foreground">From inside</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Not an outside probe. The API checks itself every 5 minutes, so it can&apos;t see a dead
              server, proxy errors or rate limiting. Incidents count against uptime too, so report
              any outage it missed.
            </p>
          </div>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {(summary?.services ?? []).map((s) => (
                <ServiceRow key={s.key} service={s} />
              ))}
            </CardContent>
          </Card>

          <ErrorsView />

          <OutsideView />

          {/* Past incidents */}
          <div>
            <h2 className="mb-3 text-base font-semibold text-foreground">
              Incidents
            </h2>
            {summary && summary.incidents.length > 0 ? (
              <div className="space-y-4">
                {summary.incidents.map((inc) => (
                  <IncidentCard key={inc.id} incident={inc} onChanged={load} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8">
                  <EmptyState
                    icon={CheckCircle}
                    tone="positive"
                    title="No incidents reported"
                    description="When something goes wrong, incident updates will appear here."
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- errors ---------------------------------- */

const SENTRY_ISSUES_URL = "https://unifesto.sentry.io/issues/";
const LEVEL_TONE: Record<string, string> = {
  fatal: "text-destructive",
  error: "text-destructive",
  warning: "text-warning",
};

/**
 * Unresolved Sentry issues across backend, web, apex and mobile that fired in
 * the last 24 hours, busiest first. Each row opens the issue in Sentry and can
 * resolve it there.
 */
function ErrorsView() {
  const [data, setData] = useState<SentryIssues | null>(null);
  const [loadError, setLoadError] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState("");

  const resolve = async (id: string) => {
    setResolving(id);
    setResolveError("");
    const { error } = await resolveSentryIssue(id);
    setResolving(null);
    if (error) {
      setResolveError(error.message || "Couldn’t resolve the issue.");
      return;
    }
    setData((d) =>
      d && { ...d, total: d.total == null ? null : d.total - 1, issues: d.issues.filter((i) => i.id !== id) },
    );
  };

  useEffect(() => {
    void getSentryIssues().then(({ data, error }) => {
      setData(data);
      setLoadError(error?.message ?? "");
    });
  }, []);

  const more = data?.total != null ? data.total - data.issues.length : 0;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="mb-1 text-base font-semibold text-foreground">Errors</h2>
          <p className="text-xs text-muted-foreground">
            Sentry · unresolved, last 24 hours
            {data?.fetchedAt ? ` · checked ${new Date(data.fetchedAt).toLocaleTimeString("en-IN")}` : ""}
          </p>
        </div>
        <a
          href={SENTRY_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary hover:underline"
        >
          Open Sentry
        </a>
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {loadError || data?.error ? (
            <p className="p-4 text-sm text-destructive">{loadError || data?.error}</p>
          ) : !data ? (
            <div className="p-4">
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !data.configured ? (
            <p className="p-4 text-sm text-muted-foreground">
              Sentry isn&apos;t connected on the server. Add a token with event:read and event:write as
              SENTRY_API_TOKEN in the backend&apos;s .env.
            </p>
          ) : data.issues.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No unresolved errors in the last 24 hours.</p>
          ) : (
            <>
              {resolveError && <p className="p-4 text-sm text-destructive">{resolveError}</p>}
              {data.issues.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-4 p-4">
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="group min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:underline">{i.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.project} · {i.shortId}
                      {i.culprit ? ` · ${i.culprit}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i.count} event{i.count === 1 ? "" : "s"} · {i.users} user{i.users === 1 ? "" : "s"} · last{" "}
                      {new Date(i.lastSeen).toLocaleString("en-IN")}
                    </p>
                  </a>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={cn("text-xs font-medium", LEVEL_TONE[i.level] ?? "text-muted-foreground")}>
                      {i.level}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resolving === i.id}
                      onClick={() => resolve(i.id)}
                      aria-label={`Resolve ${i.shortId}`}
                    >
                      <CheckCircle className="h-4 w-4" /> {resolving === i.id ? "Resolving…" : "Resolve"}
                    </Button>
                  </div>
                </div>
              ))}
              {more > 0 && (
                <p className="p-4 text-xs text-muted-foreground">
                  {more} more in Sentry.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------- outside view + maintenance ---------------------- */

const MONITOR_BADGE: Record<ExternalMonitor["status"], "success" | "destructive" | "warning" | "neutral"> = {
  up: "success",
  down: "destructive",
  degraded: "warning",
  paused: "neutral",
  unknown: "neutral",
};
const upPct = (v: number | null) => (v == null ? "–" : `${v.toFixed(2)}%`);

/**
 * UptimeRobot's view from outside our network (the bars above are our own
 * sampler, which can't see an outage that takes it down too). Plus the
 * one-off seat-count recount, which was backend-only.
 */
function OutsideView() {
  const [ext, setExt] = useState<ExternalStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [recount, setRecount] = useState<{ busy: boolean; result: string }>({ busy: false, result: "" });

  useEffect(() => {
    void getExternalStatus().then(({ data, error }) => {
      setExt(data);
      setLoadError(error?.message ?? "");
    });
  }, []);

  const runRecount = async () => {
    if (!window.confirm("Recount seats on every event and ticket type? Groups count as their group size. Safe to re-run.")) return;
    setRecount({ busy: true, result: "" });
    const { data, error } = await reconcileSeatCounts();
    setRecount({
      busy: false,
      result: error
        ? error.message
        : `Done: ${data?.eventsReset ?? 0} events and ${data?.ticketTypesReset ?? 0} ticket types recounted.`,
    });
  };

  return (
    <>
      <div>
        <h2 className="mb-1 text-base font-semibold text-foreground">From outside</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          UptimeRobot{ext?.fetchedAt ? ` · checked ${new Date(ext.fetchedAt).toLocaleTimeString("en-IN")}` : ""}
        </p>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {loadError || ext?.error ? (
              <p className="p-4 text-sm text-destructive">{loadError || ext?.error}</p>
            ) : !ext ? (
              <div className="p-4">
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !ext.configured ? (
              <p className="p-4 text-sm text-muted-foreground">UptimeRobot isn&apos;t connected on the server.</p>
            ) : ext.monitors.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No monitors set up.</p>
            ) : (
              ext.monitors.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      24h {upPct(m.uptime.day)} · 7d {upPct(m.uptime.week)} · 30d {upPct(m.uptime.month)}
                      {m.responseMs != null ? ` · ${m.responseMs} ms` : ""}
                    </p>
                    {m.lastDown && (
                      <p className="text-xs text-muted-foreground">
                        Last down {new Date(m.lastDown.at).toLocaleString("en-IN")} for {Math.max(1, Math.round(m.lastDown.durationSec / 60))} min
                        {m.lastDown.reason ? ` (${m.lastDown.reason})` : ""}
                      </p>
                    )}
                  </div>
                  <Badge variant={MONITOR_BADGE[m.status]}>{m.status.charAt(0).toUpperCase() + m.status.slice(1)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-foreground">Maintenance</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Recount seats</p>
              <p className="text-xs text-muted-foreground">
                Rebuilds every event&apos;s and ticket type&apos;s sold-seat counter from its bookings, counting groups as their size.
              </p>
              {recount.result && <p className="mt-1 text-xs text-foreground">{recount.result}</p>}
            </div>
            <Button variant="outline" onClick={runRecount} disabled={recount.busy}>
              {recount.busy ? "Recounting…" : "Recount seats"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* -------------------------------- service row ----------------------------- */

function ServiceRow({ service }: { service: StatusServiceEntry }) {
  const up = service.currentStatus === "up";
  const down = service.currentStatus === "down";
  const statusText = up ? "Operational" : down ? "Down" : "No data";
  const statusColor = up
    ? "text-success"
    : down
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div className="px-6 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{service.name}</span>
          {service.latencyMs != null && up && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {service.latencyMs}ms
            </span>
          )}
        </div>
        <span className={cn("text-sm font-medium", statusColor)}>
          {statusText}
        </span>
      </div>

      {/* 90-day bar */}
      <div className="flex h-8 items-stretch gap-[2px] overflow-hidden">
        {service.days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${
              d.uptime == null ? "no data" : `${d.uptime}% uptime`
            }`}
            className={cn("flex-1 rounded-[2px]", dayColor(d.status))}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>90 days ago</span>
        <span>
          {service.uptimePercent == null
            ? "Collecting data…"
            : `${service.uptimePercent}% uptime`}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}

/* -------------------------------- incidents ------------------------------- */

function impactVariant(
  impact: IncidentImpact
): "neutral" | "warning" | "destructive" | "brand" {
  switch (impact) {
    case "CRITICAL":
      return "destructive";
    case "MAJOR":
      return "warning";
    case "MINOR":
      return "neutral";
    default:
      return "brand";
  }
}

function IncidentCard({
  incident,
  onChanged,
}: {
  incident: Incident;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const resolved = incident.status === "RESOLVED";

  const advance = async (status: IncidentStatus) => {
    setBusy(true);
    await updateIncident(incident.id, { status });
    setBusy(false);
    onChanged();
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={impactVariant(incident.impact)}>
            {INCIDENT_IMPACT_LABEL[incident.impact]}
          </Badge>
          <Badge variant={resolved ? "success" : "warning"}>
            {INCIDENT_STATUS_LABEL[incident.status]}
          </Badge>
          {incident.createdBy === null && (
            <Badge variant="neutral">Auto-detected</Badge>
          )}
          <p className="font-medium text-foreground">{incident.title}</p>
        </div>
        {incident.body && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {incident.body}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Started {fmtDate(incident.startedAt)}</span>
          {incident.resolvedAt && (
            <span>Resolved {fmtDate(incident.resolvedAt)}</span>
          )}
          {incident.affectedServices.length > 0 && (
            <span>Affected: {incident.affectedServices.join(", ")}</span>
          )}
        </div>
        {!resolved && (
          <div className="flex flex-wrap gap-2 pt-1">
            {STATUSES.filter((st) => st !== incident.status).map((st) => (
              <Button
                key={st}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => advance(st)}
              >
                {INCIDENT_STATUS_LABEL[st]}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IncidentForm({
  services,
  onClose,
  onSaved,
}: {
  services: StatusServiceEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [impact, setImpact] = useState<IncidentImpact>("MINOR");
  const [affected, setAffected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = (key: string) =>
    setAffected((p) =>
      p.includes(key) ? p.filter((k) => k !== key) : [...p, key]
    );

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    const { error } = await createIncident({
      title: title.trim(),
      body: body.trim() || undefined,
      impact,
      affectedServices: affected,
    });
    setSaving(false);
    if (error) {
      setError(error.message || "Could not report the incident.");
      return;
    }
    onSaved();
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" weight="duotone" />
          <p className="font-medium text-foreground">Report an incident</p>
        </div>
        {error && <ErrorNotice message={error} />}
        <div className="space-y-1.5">
          <Label htmlFor="inc-title">Title</Label>
          <Input
            id="inc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's happening?"
            maxLength={300}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="status-impact">Impact</Label>
            <Select
              value={impact}
              onValueChange={(v) => setImpact(v as IncidentImpact)}
            >
              <SelectTrigger id="status-impact">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPACTS.map((i) => (
                  <SelectItem key={i} value={i}>
                    {INCIDENT_IMPACT_LABEL[i]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label id="status-affected-services-label">Affected services</Label>
            <div role="group" aria-labelledby="status-affected-services-label" className="flex flex-wrap gap-1.5">
              {services.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    affected.includes(s.key)
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inc-body">Details (optional)</Label>
          <Textarea
            id="inc-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's affected and what are you doing about it?"
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!title.trim() || saving}>
            <Plus className="h-4 w-4" />
            {saving ? "Reporting…" : "Report incident"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
