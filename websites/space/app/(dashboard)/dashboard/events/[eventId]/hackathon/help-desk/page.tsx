"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HackPage, useLivePoll, useResult, useEventRunning } from "@/components/hackathon/HackParts";
import { HELP_STATUS_LABEL, escalateHelpQuery, getHelpInbox, setHelpQueryStatus, type HelpInboxQuery, type HelpQueryStatus } from "@/lib/api/hackathon";
import { formatWhen } from "@/lib/hackathon";
import { cn } from "@/lib/utils/cn";

/** "5 min ago", falling back to the date after a day. */
function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return formatWhen(iso);
}

/**
 * The help desk (port of HackathonHelpDeskScreen): queries teams raised. Pick
 * one up so the team knows someone's coming, then resolve it.
 */
export default function HelpDeskPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getHelpInbox(eventId), [eventId]);
  const { data: inbox, setData, error, setError, reload, loaded } = useResult(fetcher);
  const running = useEventRunning();
  useLivePoll(() => void reload(), running);
  const [busy, setBusy] = useState<string | null>(null);

  const move = async (q: HelpInboxQuery, status: HelpQueryStatus) => {
    setBusy(q.id);
    const res = await setHelpQueryStatus(eventId, q.id, status);
    setBusy(null);
    if (!res.ok) return setError(res.message);
    setData(res.data);
  };

  // D27: the organisers get it as a Space Assist case; the query stays here.
  const escalate = async (q: HelpInboxQuery) => {
    if (!window.confirm("Escalate to the organisers? They get this query, with the team and room, as an Assist case.")) return;
    setBusy(q.id);
    const res = await escalateHelpQuery(eventId, q.id);
    setBusy(null);
    if (!res.ok) return setError(res.message);
    setData(res.data);
  };

  const queries = inbox?.queries ?? [];
  const active = queries.filter((q) => q.status !== "RESOLVED");
  const resolved = queries.filter((q) => q.status === "RESOLVED");

  const card = (q: HelpInboxQuery) => (
    <Card key={q.id} className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{q.topicName}</p>
        <span
          className={cn(
            "text-xs",
            q.status === "OPEN" ? "text-destructive" : q.status === "ACKNOWLEDGED" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {HELP_STATUS_LABEL[q.status]}
          {q.handledByName && q.status !== "OPEN" ? ` · ${q.handledByMe ? "you" : q.handledByName}` : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{[q.team.teamCode, q.team.name, q.roomName].filter(Boolean).join(" · ")}</p>
      <p className="whitespace-pre-line text-sm text-foreground">{q.message}</p>
      <p className="text-xs text-muted-foreground">{[q.raisedByName, timeAgo(q.createdAt)].filter(Boolean).join(" · ")}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {q.status === "OPEN" && (
          <Button size="sm" disabled={busy === q.id} onClick={() => void move(q, "ACKNOWLEDGED")}>
            I&apos;m on it
          </Button>
        )}
        {q.status !== "RESOLVED" ? (
          <Button size="sm" variant="outline" disabled={busy === q.id} onClick={() => void move(q, "RESOLVED")}>
            Resolved
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy === q.id} onClick={() => void move(q, "OPEN")}>
            Reopen
          </Button>
        )}
        {q.caseId ? (
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/dashboard/assist?case=${q.caseId}`}>Escalated · Open case</Link>
          </Button>
        ) : (
          q.status !== "RESOLVED" && (
            <Button size="sm" variant="ghost" disabled={busy === q.id} onClick={() => void escalate(q)}>
              Escalate to organiser
            </Button>
          )
        )}
      </div>
    </Card>
  );

  return (
    <HackPage
      eventId={eventId}
      title="Queries from teams"
      subtitle={
        inbox
          ? inbox.canManage
            ? "Every query teams raised. Refreshing every 10 seconds."
            : "Queries sent to you as a point of contact or room volunteer."
          : undefined
      }
      error={error || (loaded && inbox === null ? "This event isn't running a hackathon." : "")}
      ready={!!inbox}
    >
      <section className="space-y-3">
        <h2 className="px-1 text-sm font-semibold text-foreground">Open · {active.length}</h2>
        {active.length ? (
          <div className="grid gap-4 md:grid-cols-2">{active.map(card)}</div>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">All clear. New queries show up here.</p>
        )}
      </section>
      {resolved.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-foreground">Resolved</h2>
          <div className="grid gap-4 md:grid-cols-2">{resolved.map(card)}</div>
        </section>
      )}
    </HackPage>
  );
}
