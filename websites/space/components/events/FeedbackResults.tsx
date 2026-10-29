"use client";

import { useEffect, useState } from "react";
import { ChatCircle, DownloadSimple, Star, Heart, Users } from "@unifesto/unicon/react";
import { getFeedbackCsv, getFeedbackResults, type FeedbackResults as Results } from "@/lib/api/feedback";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** A labelled bar, `count` out of `total`. */
function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? Math.round((count * 100) / total) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 truncate text-muted-foreground" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

/** F3: what attendees said: averages, NPS, the rating spread, each question and the comments. */
export function FeedbackResults({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getFeedbackResults(eventId).then((r) => (r.ok ? setData(r.data) : setError(r.message)));
  }, [eventId]);

  const exportCsv = async () => {
    setBusy(true);
    const r = await getFeedbackCsv(eventId);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    const url = URL.createObjectURL(new Blob([r.data], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "feedback.csv" }).click();
    URL.revokeObjectURL(url);
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;
  if (!data.count) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No feedback yet. Responses show up here as attendees rate the event.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Responses" value={data.count.toLocaleString("en-IN")} icon={Users} />
        <StatCard title="Average rating" value={data.averageRating != null ? `${data.averageRating} / 5` : "-"} icon={Star} tone="brand" />
        <StatCard
          title="NPS"
          value={data.nps.score != null ? String(data.nps.score) : "-"}
          hint={`${data.nps.promoters} promoters, ${data.nps.passives} passives, ${data.nps.detractors} detractors`}
          icon={Heart}
          tone="success"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Ratings</CardTitle>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void exportCsv()}>
            <DownloadSimple className="h-4 w-4" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...data.distribution].reverse().map((d) => (
            <Bar key={d.value} label={`${d.value} star${d.value === 1 ? "" : "s"}`} count={d.count} total={data.count} />
          ))}
        </CardContent>
      </Card>

      {data.questions.map((q) => (
        <Card key={q.id}>
          <CardHeader>
            <CardTitle className="text-base">{q.label}</CardTitle>
            <p className="text-xs text-muted-foreground">{q.answered} answered</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.options ? (
              q.options.map((o) => <Bar key={o.option} label={o.option} count={o.count} total={q.answered} />)
            ) : q.texts ? (
              <ul className="space-y-1.5 text-sm text-foreground">
                {q.texts.map((t, i) => (
                  <li key={i} className="rounded-md bg-muted px-3 py-2">
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-foreground">Average {q.average ?? "-"}</p>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ChatCircle className="h-4 w-4" />
            Comments ({data.comments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.comments.map((c, i) => (
                <li key={i} className="py-2.5 text-sm">
                  <span className="mr-2 font-medium tabular-nums text-foreground">{c.rating}★</span>
                  {c.comment}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
