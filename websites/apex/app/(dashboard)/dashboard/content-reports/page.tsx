"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listContentReports,
  updateContentReport,
  REASON_LABELS,
  TARGET_LABELS,
  type ContentReport,
  type ContentReportStatus,
  type ContentReportTarget,
} from "@/lib/api/content-reports-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

type StatusFilter = ContentReportStatus | "ALL";
type TypeFilter = ContentReportTarget | "ALL";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "OPEN", label: "Open" },
  { key: "REVIEWING", label: "Reviewing" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "DISMISSED", label: "Dismissed" },
  { key: "ALL", label: "All" },
];

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: "ALL", label: "Everything" },
  { key: "EVENT", label: "Events" },
  { key: "SPACE", label: "Spaces" },
  { key: "REGISTRATION", label: "Tickets" },
];

const STATUS_BADGE: Record<ContentReportStatus, "warning" | "brand" | "success" | "neutral"> = {
  OPEN: "warning",
  REVIEWING: "brand",
  RESOLVED: "success",
  DISMISSED: "neutral",
};

/** Admin detail page for the reported thing. A ticket opens its transaction. */
function targetHref(r: ContentReport): string {
  if (r.targetType === "EVENT") return `/dashboard/events/${r.targetId}`;
  if (r.targetType === "SPACE") return `/dashboard/spaces/${r.targetId}`;
  return `/dashboard/transactions/${r.targetId}`;
}

type RowState = { busy?: boolean; err?: string; note?: string };

export default function ContentReportsPage() {
  const [reports, setReports] = useState<ContentReport[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [type, setType] = useState<TypeFilter>("ALL");
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  // Load the whole queue once (backend caps at 200) and filter here, so the
  // tab counts and the "N reports on this" grouping are always complete.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await listContentReports();
    if (error) setError(error.message);
    else setReports(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = (id: string, patch: RowState) =>
    setRowState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { OPEN: 0, REVIEWING: 0, RESOLVED: 0, DISMISSED: 0, ALL: 0 };
    for (const r of reports ?? []) {
      if (type !== "ALL" && r.targetType !== type) continue;
      c[r.status] += 1;
      c.ALL += 1;
    }
    return c;
  }, [reports, type]);

  // How many still-active reports point at the same thing — repeat reports
  // are the strongest signal of a real problem, so surface them on each row.
  const activeOnTarget = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reports ?? []) {
      if (r.status === "OPEN" || r.status === "REVIEWING") {
        m.set(r.targetId, (m.get(r.targetId) ?? 0) + 1);
      }
    }
    return m;
  }, [reports]);

  const visible = useMemo(
    () =>
      (reports ?? []).filter(
        (r) => (status === "ALL" || r.status === status) && (type === "ALL" || r.targetType === type)
      ),
    [reports, status, type]
  );

  const move = useCallback(
    async (r: ContentReport, next: ContentReportStatus) => {
      const note = rowState[r.id]?.note?.trim();
      patchRow(r.id, { busy: true, err: undefined });
      const { data, error } = await updateContentReport(r.id, next, note || undefined);
      if (error || !data) {
        patchRow(r.id, { busy: false, err: error?.message ?? "Couldn't update this report." });
        return;
      }
      // Patch in place (keeping the resolved target name / reporter, which the
      // PATCH response doesn't include) rather than refetching the whole queue.
      setReports((list) =>
        (list ?? []).map((x) =>
          x.id === r.id
            ? {
                ...x,
                status: data.status,
                resolutionNote: data.resolutionNote,
                resolvedAt: data.resolvedAt,
                resolvedById: data.resolvedById,
              }
            : x
        )
      );
      patchRow(r.id, { busy: false, note: "" });
    },
    [rowState]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Reports"
        subtitle="Events, spaces and tickets that users flagged from the app. Review the reported item, then resolve it (action taken) or dismiss it (nothing wrong). Each new report is also emailed to report-now@unifesto.app."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={status === t.key ? "default" : "outline"}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[t.key]}</span>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPE_TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={type === t.key ? "secondary" : "ghost"}
            onClick={() => setType(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {status === "OPEN" ? "No open reports. Nothing needs review." : "No reports match these filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              repeat={activeOnTarget.get(r.targetId) ?? 0}
              state={rowState[r.id] ?? {}}
              onNote={(v) => patchRow(r.id, { note: v, err: undefined })}
              onMove={(next) => void move(r, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportRow({
  report: r,
  repeat,
  state,
  onNote,
  onMove,
}: {
  report: ContentReport;
  repeat: number;
  state: RowState;
  onNote: (v: string) => void;
  onMove: (next: ContentReportStatus) => void;
}) {
  const active = r.status === "OPEN" || r.status === "REVIEWING";
  const deleted = r.targetName === "(deleted)";
  const reporter = r.reporter?.fullName || (r.reporter?.username ? `@${r.reporter.username}` : "Unknown user");

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_BADGE[r.status]}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>
              <Badge variant="outline">{TARGET_LABELS[r.targetType]}</Badge>
              {active && repeat > 1 && <Badge variant="destructive">{repeat} open reports on this</Badge>}
            </div>
            {deleted ? (
              <p className="text-base font-semibold text-muted-foreground">Deleted {TARGET_LABELS[r.targetType].toLowerCase()}</p>
            ) : (
              <Link href={targetHref(r)} className="block truncate text-base font-semibold text-foreground hover:text-primary hover:underline">
                {r.targetName}
              </Link>
            )}
            <p className="text-xs text-muted-foreground">
              {reporter}
              {r.reporter?.id && (
                <>
                  {" · "}
                  <Link href={`/dashboard/users/${r.reporter.id}`} className="hover:underline">
                    view reporter
                  </Link>
                </>
              )}
              {" · "}
              {fmtDateTime(r.createdAt)}
            </p>
          </div>
          <p className="text-sm font-medium text-foreground">{REASON_LABELS[r.reason] ?? r.reason}</p>
        </div>

        {r.details && (
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
            {r.details}
          </p>
        )}

        {!active && (
          <p className="text-xs text-muted-foreground">
            {r.status === "RESOLVED" ? "Resolved" : "Dismissed"} {fmtDateTime(r.resolvedAt)}
            {r.resolutionNote ? <> · {r.resolutionNote}</> : null}
          </p>
        )}

        {active && (
          <Textarea
            placeholder="Internal note (optional): what you checked or did"
            value={state.note ?? ""}
            onChange={(e) => onNote(e.target.value)}
            rows={2}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {r.status === "OPEN" && (
            <Button size="sm" variant="outline" disabled={state.busy} onClick={() => onMove("REVIEWING")}>
              Start review
            </Button>
          )}
          {active && (
            <>
              <Button size="sm" disabled={state.busy} onClick={() => onMove("RESOLVED")}>
                Resolve
              </Button>
              <Button size="sm" variant="ghost" disabled={state.busy} onClick={() => onMove("DISMISSED")}>
                Dismiss
              </Button>
            </>
          )}
          {!active && (
            <Button size="sm" variant="outline" disabled={state.busy} onClick={() => onMove("OPEN")}>
              Reopen
            </Button>
          )}
          {state.busy && <span className="text-xs text-muted-foreground">Saving…</span>}
          {state.err && <span className="text-xs font-medium text-[hsl(358_65%_44%)]">{state.err}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
