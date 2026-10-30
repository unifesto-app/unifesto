"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Coffee, Gavel, Hourglass, LockOpen, Timer, UsersFour } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { HackPage, useLivePoll, useResult, useEventRunning } from "@/console/components/hackathon/HackParts";
import {
  forceComplete,
  getQueues,
  reassignRequest,
  removeFromQueue,
  reopenJudgment,
  updateJudge,
  updatePanel,
  type MonitorQueue,
  type QueueMonitor,
  type QueueTeam,
} from "@/console/lib/api/hackathon";
import type { Result } from "@/console/lib/api/call";
import { evalStatusLabel, formatClock, secondsUntil } from "@/console/lib/hackathon";
import { cn } from "@/console/lib/utils/cn";

const teamLabel = (t: QueueTeam | null) => (t ? `${t.teamCode ?? "—"}  ${t.name}` : "Team");

/** Ticking countdown to a server time; amber in the last minute, red once up (mobile SlotTimer). */
function SlotTimer({ until }: { until: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = secondsUntil(until, now);
  if (left == null) return null;
  const done = left <= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-0.5 text-xs tabular-nums",
        done ? "text-destructive" : left <= 60 ? "text-warning" : "text-foreground"
      )}
    >
      <Timer className="h-3.5 w-3.5" weight="bold" />
      {done ? "Time's up" : formatClock(left)}
    </span>
  );
}

/**
 * The curator's live view of every judge's and panel's queue (port of
 * HackathonQueuesScreen): take a team out, move it, finish a stuck slot, pause
 * a judge, and reopen locked marks.
 */
export default function HackathonQueuesPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getQueues(eventId), [eventId]);
  const { data, setData, error, setError, reload } = useResult(fetcher);
  const running = useEventRunning();
  useLivePoll(() => void reload(), running);

  const run = async (p: Promise<Result<QueueMonitor>>) => {
    const res = await p;
    if (!res.ok) return setError(res.message);
    setError("");
    setData(res.data);
  };

  if (!data) return <HackPage eventId={eventId} title="Live queues" error={error} ready={false} />;

  const togglePause = async (q: MonitorQueue) => {
    const res =
      q.kind === "PANEL"
        ? await updatePanel(eventId, q.id, { isAvailable: !q.isAvailable })
        : await updateJudge(eventId, q.judgeId!, { isAvailable: !q.isAvailable });
    if (!res.ok) return setError(res.message);
    void reload();
  };

  const remove = (requestId: string, team: QueueTeam | null) => {
    if (window.confirm(`Take ${team?.teamCode ?? "this team"} out of the queue? They're told and can join again.`)) {
      void run(removeFromQueue(eventId, requestId));
    }
  };

  const finish = (requestId: string, marked: number, team: QueueTeam | null) => {
    // With no marks, finishing would end the team's turn with nothing: it can only be a no-show.
    const copy = marked
      ? "Finish this slot? Marks already submitted count. Judges who haven't submitted can't add theirs afterwards."
      : `No judge has marked ${team?.teamCode ?? "this team"} yet. Close the slot as a no-show? The team is told and can join a queue again.`;
    if (window.confirm(copy)) void run(forceComplete(eventId, requestId, !marked));
  };

  const reopen = (judgmentId: string, judgeName: string, team: QueueTeam | null) => {
    if (window.confirm(`Reopen ${judgeName}'s marks? They get 5 more minutes to change their marks for ${team?.teamCode ?? "this team"}. They're notified.`)) {
      void run(reopenJudgment(eventId, judgmentId));
    }
  };

  /** "Move to…" select: other queues of the same kind; keeps the team's place in time. */
  const moveSelect = (q: MonitorQueue, requestId: string) => {
    const others = data.queues.filter((x) => x.kind === q.kind && x.id !== q.id);
    if (!others.length) return null;
    return (
      <select
        aria-label="Move to another judge"
        value=""
        onChange={(e) => {
          const o = others.find((x) => x.id === e.target.value);
          if (o && window.confirm(`Move this team to ${o.name}? It keeps its place in time, and the team is told.`)) void run(reassignRequest(eventId, requestId, o.kind === "PANEL" ? { panelId: o.id } : { judgeUserId: o.id }));
        }}
        className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground"
      >
        <option value="">Move to…</option>
        {others.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.waiting.length ? ` (${o.waiting.length} waiting)` : ""}
          </option>
        ))}
      </select>
    );
  };

  const active = data.queues.filter((q) => q.current || q.waiting.length);
  const idle = data.queues.filter((q) => !q.current && !q.waiting.length);
  const reopenable = data.recent.flatMap((r) =>
    r.roundActive ? r.judgments.filter((j) => j.locked).map((j) => ({ ...j, team: r.team, roundName: r.roundName })) : []
  );

  return (
    <HackPage
      eventId={eventId}
      title="Live queues"
      subtitle={`Refreshing every 10 seconds${data.activeRounds.length ? ` · ${data.activeRounds.map((r) => r.name).join(", ")} open` : " · No round open"}`}
      error={error}
      ready
    >
      {!active.length && <p className="text-sm text-muted-foreground">Nobody is in a queue right now.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {active.map((q) => (
          <ListGroup
            key={`${q.kind}:${q.id}`}
            title={`${q.name}${q.role === "MENTOR" ? " (mentor)" : ""}${q.location ? ` · ${q.location}` : ""}`}
            action={
              <Button size="sm" variant="ghost" onClick={() => void togglePause(q)}>
                {q.isAvailable ? "Pause" : "Resume"}
              </Button>
            }
          >
            {!q.isAvailable && <ListRow icon={<Coffee className="h-5 w-5 text-muted-foreground" weight="fill" />} label="On a break" />}
            {q.current && (
              <div className="flex flex-wrap items-center gap-2 pr-3">
                <div className="min-w-0 flex-1">
                  <ListRow
                    icon={<Gavel className={q.current.status === "AWAITING_MARKS" ? "h-5 w-5 text-warning" : "h-5 w-5 text-success"} weight="fill" />}
                    label={teamLabel(q.current.team)}
                    sublabel={evalStatusLabel(q.current.status)}
                    trailing={q.current.status === "IN_PROGRESS" ? <SlotTimer until={q.current.slotEndsAt} /> : undefined}
                  />
                </div>
                {q.current.status === "CALLED" && moveSelect(q, q.current.requestId)}
                <Button size="sm" variant="ghost" onClick={() => finish(q.current!.requestId, q.current!.marked, q.current!.team)}>
                  {q.current.marked ? "Finish" : "No-show"}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(q.current!.requestId, q.current!.team)}>
                  Remove
                </Button>
              </div>
            )}
            {q.waiting.map((w) => (
              <div key={w.requestId} className="flex flex-wrap items-center gap-2 pr-3">
                <div className="min-w-0 flex-1">
                  <ListRow
                    icon={<Hourglass className="h-5 w-5 text-muted-foreground" weight="fill" />}
                    label={`${w.position}. ${teamLabel(w.team)}`}
                    sublabel={w.roundName ?? undefined}
                  />
                </div>
                {moveSelect(q, w.requestId)}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(w.requestId, w.team)}>
                  Remove
                </Button>
              </div>
            ))}
          </ListGroup>
        ))}
      </div>

      {reopenable.length > 0 && (
        <ListGroup title="Locked marks you can reopen" description="Marks lock 5 minutes after a judge submits. Reopening gives them 5 more minutes; you never change marks yourself.">
          {reopenable.slice(0, 15).map((j) => (
            <ListRow
              key={j.id}
              icon={<LockOpen className="h-5 w-5" weight="fill" />}
              label={teamLabel(j.team)}
              value={j.judgeName}
              onClick={() => reopen(j.id, j.judgeName, j.team)}
            />
          ))}
        </ListGroup>
      )}

      {idle.length > 0 && (
        <ListGroup title="Free">
          {idle.map((q) => (
            <div key={`${q.kind}:${q.id}`} className="flex items-center gap-2 pr-3">
              <div className="min-w-0 flex-1">
                <ListRow
                  icon={
                    !q.isAvailable ? (
                      <Coffee className="h-5 w-5 text-muted-foreground" weight="fill" />
                    ) : q.kind === "PANEL" ? (
                      <UsersFour className="h-5 w-5" weight="fill" />
                    ) : (
                      <Gavel className="h-5 w-5" weight="fill" />
                    )
                  }
                  label={q.name}
                  value={q.isAvailable ? "Free" : "On a break"}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => void togglePause(q)}>
                {q.isAvailable ? "Pause" : "Resume"}
              </Button>
            </div>
          ))}
        </ListGroup>
      )}
    </HackPage>
  );
}
