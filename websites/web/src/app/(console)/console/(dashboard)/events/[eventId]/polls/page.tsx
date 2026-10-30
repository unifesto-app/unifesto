"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash, X } from "@unifesto/unicon/react";
import {
  closePoll,
  createPoll,
  deletePoll,
  getPolls,
  launchPoll,
  setPollVisibility,
  type Poll,
  type PollResultsVisibility,
} from "@/console/lib/api/polls-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ProjectorButton } from "@/console/components/events/ProjectorButton";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";

const VISIBILITY: { value: PollResultsVisibility; label: string }[] = [
  { value: "AFTER_VOTE", label: "Attendees see results after voting" },
  { value: "AFTER_CLOSE", label: "Attendees see results when it closes" },
  { value: "ORGANISERS_ONLY", label: "Only organisers see results" },
];

// While a poll is live, refetch this often so the counts move.
// ponytail: plain polling; switch to the engagement socket if organisers need sub-second updates.
const LIVE_REFRESH_MS = 3000;

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

/**
 * Live polls for one event: draft a question, launch it during the event,
 * watch the votes come in, close it. Attendees vote from their ticket in the app.
 */
export default function EventPollsPage() {
  const eventId = useParams().eventId as string;
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // New poll form.
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [visibility, setVisibility] = useState<PollResultsVisibility>("AFTER_VOTE");

  const load = useCallback(async () => {
    const { data, error: apiError } = await getPolls(eventId);
    if (apiError) setError(apiError.message);
    else if (data) {
      setPolls(data);
      setError("");
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const anyLive = !!polls?.some((p) => p.status === "LIVE");
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [anyLive, load]);

  const run = async (key: string, fn: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(key);
    const { error: apiError } = await fn();
    if (apiError) setError(apiError.message);
    await load();
    setBusy(null);
  };

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = !!question.trim() && filled.length >= 2;

  const handleCreate = () =>
    run("create", async () => {
      const res = await createPoll(eventId, { question: question.trim(), options: filled, resultsVisibility: visibility });
      if (!res.error) {
        setQuestion("");
        setOptions(["", ""]);
      }
      return res;
    });

  if (!polls) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live polls"
        subtitle="Ask the room a question during the event. Attendees vote from their ticket in the Unifesto app, once each, and the results update live."
        actions={<ProjectorButton eventId={eventId} />}
      />

      {error && <ErrorNotice message={error} />}

      <Card>
        <CardHeader>
          <CardTitle>New poll</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              value={question}
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Which session should we repeat tomorrow?"
            />
          </div>
          <div role="group" aria-labelledby="poll-options" className="space-y-2">
            <Label id="poll-options">Options</Label>
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={o}
                  maxLength={120}
                  aria-label={`Option ${i + 1}`}
                  onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <Button variant="outline" size="sm" onClick={() => setOptions((all) => [...all, ""])}>
                <Plus className="h-4 w-4" /> Add option
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="poll-visibility">Results</Label>
            <select
              id="poll-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as PollResultsVisibility)}
              className={`${SELECT} max-w-md`}
            >
              {VISIBILITY.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleCreate} disabled={!canCreate || busy === "create"}>
            Save as draft
          </Button>
        </CardContent>
      </Card>

      {polls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No polls yet. Draft one above, then launch it when the room is ready.</p>
      ) : (
        polls.map((p) => <PollCard key={p.id} poll={p} busy={busy} eventId={eventId} run={run} />)
      )}
    </div>
  );
}

function PollCard({
  poll: p,
  busy,
  eventId,
  run,
}: {
  poll: Poll;
  busy: string | null;
  eventId: string;
  run: (key: string, fn: () => Promise<{ error: { message: string } | null }>) => Promise<void>;
}) {
  const max = Math.max(1, ...p.results);
  const badge =
    p.status === "LIVE" ? (
      <Badge variant="success">Live</Badge>
    ) : p.status === "CLOSED" ? (
      <Badge variant="neutral">Closed</Badge>
    ) : (
      <Badge variant="outline">Draft</Badge>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">{p.question}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {p.totalVotes.toLocaleString("en-IN")} vote{p.totalVotes === 1 ? "" : "s"}
          </p>
        </div>
        {badge}
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {p.options.map((o, i) => {
            const n = p.results[i] ?? 0;
            const pct = p.totalVotes ? Math.round((n / p.totalVotes) * 100) : 0;
            return (
              <li key={i} className="space-y-1">
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-foreground">{o}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {n} · {pct}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          {p.status === "DRAFT" && (
            <Button size="sm" disabled={busy === p.id} onClick={() => run(p.id, () => launchPoll(eventId, p.id))}>
              Launch
            </Button>
          )}
          {p.status === "LIVE" && (
            <Button size="sm" variant="secondary" disabled={busy === p.id} onClick={() => run(p.id, () => closePoll(eventId, p.id))}>
              Close poll
            </Button>
          )}
          <select
            aria-label="Who sees results"
            value={p.resultsVisibility}
            disabled={busy === p.id}
            onChange={(e) => run(p.id, () => setPollVisibility(eventId, p.id, e.target.value as PollResultsVisibility))}
            className={`${SELECT} w-auto`}
          >
            {VISIBILITY.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          {p.status !== "LIVE" && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete poll"
              disabled={busy === p.id}
              onClick={() => window.confirm("Delete this poll and its votes?") && run(p.id, () => deletePoll(eventId, p.id))}
            >
              <Trash className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
