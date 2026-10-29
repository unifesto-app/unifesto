"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowsClockwise,
  ArrowSquareOut,
  LinkBreak,
  CalendarX,
  Info,
} from "@unifesto/unicon/react";
import {
  getEventById,
  getSeriesOccurrences,
  detachOccurrence,
  type Event,
  type SeriesOccurrence,
  type SeriesOccurrencesResponse,
} from "@/console/lib/api/events-api";
import { parseRRuleToState, describeRecurrence } from "@/console/lib/recurrence";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function statusVariant(
  status: string
): "neutral" | "success" | "destructive" {
  if (status === "PUBLISHED" || status === "ONGOING") return "success";
  if (status === "CANCELLED") return "destructive";
  return "neutral";
}

export default function EventOccurrencesPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [series, setSeries] = useState<SeriesOccurrencesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detachingId, setDetachingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: ev, error: evErr } = await getEventById(eventId);
    if (evErr || !ev) {
      setError(evErr?.message ?? "Could not load this event.");
      setLoading(false);
      return;
    }
    setEvent(ev);
    if (ev.isRecurring) {
      const { data, error: occErr } = await getSeriesOccurrences(eventId);
      if (occErr) setError(occErr.message);
      else setSeries(data);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDetach(occ: SeriesOccurrence) {
    setDetachingId(occ.id);
    const { error: dErr } = await detachOccurrence(occ.id);
    if (dErr) setError(dErr.message);
    else
      setSeries((prev) =>
        prev
          ? {
              ...prev,
              occurrences: prev.occurrences.map((o) =>
                o.id === occ.id ? { ...o, seriesDetached: true } : o
              ),
            }
          : prev
      );
    setDetachingId(null);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Not a recurring series — explain how to make one.
  if (event && !event.isRecurring) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Occurrences"
          subtitle="Only recurring series have occurrences."
        />
        <EmptyState
          icon={ArrowsClockwise}
          title="This event doesn't repeat"
          description="Turn on “Repeats” when creating an event to make it a recurring series. Each date then becomes its own occurrence you can manage here."
        />
      </div>
    );
  }

  const ruleSummary = series?.recurrenceRule
    ? describeRecurrence(parseRRuleToState(series.recurrenceRule))
    : null;
  const occurrences = series?.occurrences ?? [];
  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Occurrences"
        subtitle={ruleSummary ?? "Every date in this recurring series."}
      />

      {error && <ErrorNotice message={error} />}

      {/* Not-yet-published series: occurrences appear on publish. */}
      {occurrences.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="No dates scheduled yet"
          description={
            event?.status === "DRAFT"
              ? "Publish this series to generate its occurrences. Each date will inherit the tickets and details you set here."
              : "This series has no upcoming occurrences in the scheduled window."
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 flex-shrink-0" />
            <span>
              Editing a single occurrence detaches it, so a later change to the
              whole series won&apos;t overwrite it. Occurrences with registrations
              are always kept as-is.
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {occurrences.map((occ) => {
                  const isPast = new Date(occ.startDateTime).getTime() < now;
                  const canDetach =
                    !occ.seriesDetached &&
                    !isPast &&
                    occ.registeredCount === 0;
                  return (
                    <li
                      key={occ.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                    >
                      <div className="min-w-[220px] flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {formatDateTime(occ.startDateTime)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {occ.registeredCount} registered
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(occ.status)} className="text-xs">
                          {occ.status}
                        </Badge>
                        {occ.seriesDetached && (
                          <Badge variant="neutral" className="text-xs">
                            Edited individually
                          </Badge>
                        )}
                        {isPast && (
                          <Badge variant="neutral" className="text-xs">
                            Past
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {canDetach && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={detachingId === occ.id}
                            onClick={() => onDetach(occ)}
                          >
                            <LinkBreak className="h-4 w-4" />
                            {detachingId === occ.id ? "Detaching…" : "Edit separately"}
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/dashboard/events/${occ.id}`}>
                            Manage
                            <ArrowSquareOut className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {series?.generatedUntil && (
            <p className="text-xs text-muted-foreground">
              Dates are scheduled through{" "}
              {new Date(series.generatedUntil).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              . The series extends automatically over time.
            </p>
          )}
        </>
      )}
    </div>
  );
}
