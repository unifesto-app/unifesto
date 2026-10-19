"use client";

import { inr } from "@/lib/utils/money";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ChartBar,
  DownloadSimple,
  Trash,
  Spinner,
  CheckCircle,
  Warning,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import {
  EventReport,
  ReportSection,
  ReportType,
  REPORT_SECTIONS,
  deleteReport,
  generateReport,
  getEventReports,
} from "@/lib/api/reports-api";

const ALL_SECTIONS = REPORT_SECTIONS.map((s) => s.key);

const STATUS_VARIANT: Record<
  EventReport["status"],
  "neutral" | "success" | "destructive"
> = {
  PENDING: "neutral",
  READY: "success",
  FAILED: "destructive",
};

export default function ReportsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [reports, setReports] = useState<EventReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate form state.
  const [type, setType] = useState<ReportType>("DEFAULT");
  const [sections, setSections] = useState<Set<ReportSection>>(
    new Set(ALL_SECTIONS)
  );
  const [title, setTitle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      const { data, error } = await getEventReports(eventId);
      if (error) setError(error.message);
      else setReports(data ?? []);
      if (!quiet) setLoading(false);
    },
    [eventId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Reports render in the background: poll while any is still PENDING.
  const anyPending = reports.some((r) => r.status === "PENDING");
  useEffect(() => {
    if (!anyPending) return;
    const t = setTimeout(() => void load(true), 3000);
    return () => clearTimeout(t);
  }, [anyPending, reports, load]);

  const toggleSection = (key: ReportSection) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const canGenerate =
    !generating && (type === "DEFAULT" || sections.size > 0);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    const { error } = await generateReport(eventId, {
      type,
      sections:
        type === "CUSTOM"
          ? ALL_SECTIONS.filter((s) => sections.has(s))
          : undefined,
      title: title.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    setGenerating(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTitle("");
    await load();
  };

  const handleDelete = async (report: EventReport) => {
    if (!confirm(`Delete "${report.title}"? This can't be undone.`)) return;
    const { error } = await deleteReport(eventId, report.id);
    if (error) setError(error.message);
    else setReports((prev) => prev.filter((r) => r.id !== report.id));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Generate a formatted PDF summary of this event: a full report, or a custom one with just the sections you need."
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Generate ------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate a report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Type toggle */}
          <div className="space-y-1.5">
            <Label>Report type</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    key: "DEFAULT" as ReportType,
                    title: "Default",
                    desc: "The full report, every section.",
                  },
                  {
                    key: "CUSTOM" as ReportType,
                    title: "Custom",
                    desc: "Pick exactly the sections you want.",
                  },
                ]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setType(opt.key);
                    if (opt.key === "CUSTOM" && sections.size === 0)
                      setSections(new Set(ALL_SECTIONS));
                  }}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    type === opt.key
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-semibold",
                        type === opt.key ? "text-primary" : "text-foreground"
                      )}
                    >
                      {opt.title}
                    </span>
                    {type === opt.key && (
                      <CheckCircle
                        weight="fill"
                        className="h-4 w-4 text-primary"
                      />
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Section chips — only for Custom */}
          {type === "CUSTOM" && (
            <div className="space-y-1.5">
              <Label>Sections</Label>
              <div className="flex flex-wrap gap-2">
                {REPORT_SECTIONS.map((s) => {
                  const on = sections.has(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggleSection(s.key)}
                      title={s.hint}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        on
                          ? "border-primary bg-primary-soft font-medium text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {sections.size === 0 && (
                <p className="text-xs text-muted-foreground">
                  Select at least one section to include.
                </p>
              )}
            </div>
          )}

          {/* Optional title + date window */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="report-title">Title (optional)</Label>
              <Input
                id="report-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to the event name and date"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-from">From (optional)</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-to">To (optional)</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleGenerate} disabled={!canGenerate}>
              {generating ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <ChartBar className="h-4 w-4" /> Generate report
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              A dated window bounds the attendee, check-in and revenue figures.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* History -------------------------------------------------------- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">History</h2>
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={ChartBar}
                title="No reports yet"
                description="Generate your first report above. It will appear here, ready to download."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <ReportRow key={r.id} report={r} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportRow({
  report,
  onDelete,
}: {
  report: EventReport;
  onDelete: (r: EventReport) => void;
}) {
  const stats = report.stats;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {report.title}
            </span>
            <Badge variant="neutral" className="text-xs">
              {report.type}
            </Badge>
            <Badge variant={STATUS_VARIANT[report.status]} className="text-xs">
              {report.status === "FAILED" && (
                <Warning className="mr-1 inline h-3 w-3" />
              )}
              {report.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(report.createdAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" · "}
            {report.sections.length} section
            {report.sections.length === 1 ? "" : "s"}
          </p>
          {stats && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground">
              <Stat label="Attending" value={String(stats.attending)} />
              <Stat label="Checked in" value={String(stats.checkedIn)} />
              <Stat
                label="Net"
                value={inr(stats.net)}
              />
            </div>
          )}
          {report.status === "FAILED" && report.error && (
            <p className="text-xs text-destructive">{report.error}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {report.status === "READY" && report.fileUrl && (
            <a href={report.fileUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <DownloadSimple className="h-4 w-4" /> Download
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(report)}
            title="Delete report"
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-medium text-foreground">{value}</span> {label}
    </span>
  );
}
