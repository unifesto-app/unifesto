"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CaretUp } from "@unifesto/unicon/react";
import {
  getQaBoard,
  moderateQuestion,
  setQaPremoderated,
  type QaBoard,
  type Question,
  type QuestionStatus,
} from "@/console/lib/api/questions-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/console/components/ui/tabs";

// Questions arrive any time the event is on, so the queue refetches on a timer.
// ponytail: plain polling like Live polls; switch to the engagement socket if moderators need sub-second updates.
const REFRESH_MS = 4000;

const TABS: { value: QuestionStatus; label: string; empty: string }[] = [
  { value: "PENDING", label: "Waiting", empty: "Nothing waiting. New questions land here before attendees see them." },
  { value: "APPROVED", label: "Live", empty: "No live questions yet." },
  { value: "ANSWERED", label: "Answered", empty: "Nothing answered yet." },
  { value: "HIDDEN", label: "Hidden", empty: "Nothing hidden." },
];

const SELECT =
  "flex h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

type Run = (key: string, fn: () => Promise<{ error: { message: string } | null }>) => Promise<void>;

/**
 * Live Q&A moderation for one event. Attendees ask and upvote from their
 * ticket in the app; this is the queue: approve, hide, pin, mark answered.
 */
export default function EventQuestionsPage() {
  const eventId = useParams().eventId as string;
  const [board, setBoard] = useState<QaBoard | null>(null);
  const [tab, setTab] = useState<QuestionStatus>("PENDING");
  const [agendaId, setAgendaId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: apiError } = await getQaBoard(eventId, agendaId || undefined);
    if (apiError) setError(apiError.message);
    else if (data) {
      setBoard(data);
      setError("");
    }
  }, [eventId, agendaId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const run: Run = async (key, fn) => {
    setBusy(key);
    const { error: apiError } = await fn();
    if (apiError) setError(apiError.message);
    await load();
    setBusy(null);
  };

  if (!board) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const count = (s: QuestionStatus) => board.questions.filter((q) => q.status === s).length;
  const shown = board.questions.filter((q) => q.status === tab);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Q&A"
        subtitle="Attendees ask and upvote questions from their ticket in the Unifesto app while the event is on. The most-voted rise to the top."
      />

      {error && <ErrorNotice message={error} />}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <label className="flex items-center gap-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={board.premoderated}
              disabled={busy === "mode"}
              onChange={(e) => run("mode", () => setQaPremoderated(eventId, e.target.checked))}
              className="h-4 w-4 accent-primary"
            />
            Approve questions before attendees see them
          </label>
          {board.sessions.length > 0 && (
            <select
              aria-label="Session"
              value={agendaId}
              onChange={(e) => setAgendaId(e.target.value)}
              className={`${SELECT} w-auto max-w-xs`}
            >
              <option value="">All sessions</option>
              {board.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as QuestionStatus)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{count(t.value)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{TABS.find((t) => t.value === tab)!.empty}</p>
      ) : (
        <ul className="space-y-4">
          {shown.map((q) => (
            <QuestionRow key={q.id} q={q} busy={busy === q.id} eventId={eventId} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionRow({ q, busy, eventId, run }: { q: Question; busy: boolean; eventId: string; run: Run }) {
  const act = (change: Parameters<typeof moderateQuestion>[2]) => run(q.id, () => moderateQuestion(eventId, q.id, change));
  const visible = q.status === "APPROVED" || q.status === "ANSWERED";

  return (
    <li>
      <Card>
        <CardContent className="flex gap-4 pt-6">
          <div className="flex w-10 shrink-0 flex-col items-center text-muted-foreground" aria-label={`${q.votes} upvotes`}>
            <CaretUp className="h-4 w-4" />
            <span className="text-sm font-medium tabular-nums text-foreground">{q.votes}</span>
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="space-y-1">
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{q.text}</p>
              <p className="text-xs text-muted-foreground">
                {q.author}
                {q.agendaTitle ? ` · ${q.agendaTitle}` : ""}
                {" · "}
                {new Date(q.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {q.pinned && <Badge variant="brand">Pinned</Badge>}
              {q.status !== "APPROVED" && (
                <Button size="sm" disabled={busy} onClick={() => act({ status: "APPROVED" })}>
                  {q.status === "PENDING" ? "Approve" : q.status === "ANSWERED" ? "Reopen" : "Show again"}
                </Button>
              )}
              {(q.status === "PENDING" || q.status === "APPROVED") && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act({ status: "ANSWERED" })}>
                  Mark answered
                </Button>
              )}
              {visible && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ pinned: !q.pinned })}>
                  {q.pinned ? "Unpin" : "Pin to top"}
                </Button>
              )}
              {q.status !== "HIDDEN" && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ status: "HIDDEN" })}>
                  Hide
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
