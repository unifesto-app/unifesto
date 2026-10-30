"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, PencilSimple, Plus, Trash, X } from "@unifesto/unicon/react";
import {
  closeQuestion,
  createQuiz,
  deleteQuiz,
  endQuiz,
  getQuizzes,
  nextQuestion,
  startQuiz,
  updateQuiz,
  type Leaderboard,
  type ManagedQuiz,
  type QuizInput,
  type QuizQuestionInput,
} from "@/console/lib/api/quizzes-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";

// While a quiz runs, refetch this often so answer counts and the board move.
// ponytail: plain polling like live polls; use the engagement socket if organisers need sub-second updates.
const LIVE_REFRESH_MS = 2000;
const TIME_LIMITS = [10, 15, 20, 30, 45, 60];

const SELECT =
  "flex h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

type Run = (key: string, fn: () => Promise<{ error: { message: string } | null }>) => Promise<boolean>;

const blankQuestion = (): QuizQuestionInput => ({
  prompt: "",
  options: ["", ""],
  correctIndexes: [],
  timeLimitSec: 20,
  points: 100,
});
const blankQuiz = (): QuizInput => ({ title: "", speedBonus: true, questions: [blankQuestion()] });

/** Why a draft can't be saved yet, or null when it can. */
function draftProblem(q: QuizInput): string | null {
  if (!q.title.trim()) return "Give the quiz a title.";
  for (const [i, x] of q.questions.entries()) {
    if (!x.prompt.trim()) return `Question ${i + 1} needs a question.`;
    if (x.options.some((o) => !o.trim())) return `Question ${i + 1} has a blank option.`;
    if (!x.correctIndexes.length) return `Tick the right answer for question ${i + 1}.`;
  }
  return null;
}

/**
 * Live quizzes for one event: build the questions, start it during the event,
 * step through one question at a time, and show the board. Attendees answer
 * from their ticket in the Unifesto app; the server times and scores them.
 */
export default function EventQuizzesPage() {
  const eventId = useParams().eventId as string;
  const [quizzes, setQuizzes] = useState<ManagedQuiz[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuizInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Server clock minus this browser's, so countdowns match what attendees see.
  const [skew, setSkew] = useState(0);

  const load = useCallback(async () => {
    const { data, error: apiError } = await getQuizzes(eventId);
    if (apiError) setError(apiError.message);
    else if (data) {
      setQuizzes(data);
      setError("");
      if (data[0]) setSkew(new Date(data[0].serverNow).getTime() - Date.now());
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const anyLive = !!quizzes?.some((q) => q.status === "LIVE");
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [anyLive, load]);

  const run: Run = async (key, fn) => {
    setBusy(key);
    const { error: apiError } = await fn();
    if (apiError) setError(apiError.message);
    await load();
    setBusy(null);
    return !apiError;
  };

  const save = () => {
    if (!draft) return;
    const body: QuizInput = {
      title: draft.title.trim(),
      speedBonus: draft.speedBonus,
      questions: draft.questions.map((q) => ({ ...q, prompt: q.prompt.trim(), options: q.options.map((o) => o.trim()) })),
    };
    void run("save", () => (editingId ? updateQuiz(eventId, editingId, body) : createQuiz(eventId, body))).then((ok) => {
      if (ok) {
        setDraft(null);
        setEditingId(null);
      }
    });
  };

  if (!quizzes) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live quizzes"
        subtitle="Run a timed quiz during the event. Questions go out one at a time, attendees answer from their ticket in the Unifesto app, and the leaderboard updates after each question."
        actions={
          !draft && (
            <Button onClick={() => setDraft(blankQuiz())}>
              <Plus className="h-4 w-4" /> New quiz
            </Button>
          )
        }
      />

      {error && <ErrorNotice message={error} />}

      {draft && (
        <QuizBuilder
          draft={draft}
          setDraft={setDraft}
          editing={!!editingId}
          saving={busy === "save"}
          onSave={save}
          onCancel={() => {
            setDraft(null);
            setEditingId(null);
          }}
        />
      )}

      {quizzes.length === 0 && !draft ? (
        <p className="text-sm text-muted-foreground">No quizzes yet. Build one, then start it when the room is ready.</p>
      ) : (
        quizzes.map((q) => (
          <QuizCard
            key={q.id}
            quiz={q}
            eventId={eventId}
            busy={busy}
            run={run}
            skew={skew}
            onEdit={() => {
              setEditingId(q.id);
              setDraft({
                title: q.title,
                speedBonus: q.speedBonus,
                questions: q.questions.map(({ prompt, options, correctIndexes, timeLimitSec, points }) => ({
                  prompt,
                  options,
                  correctIndexes,
                  timeLimitSec,
                  points,
                })),
              });
            }}
          />
        ))
      )}
    </div>
  );
}

function QuizBuilder({
  draft,
  setDraft,
  editing,
  saving,
  onSave,
  onCancel,
}: {
  draft: QuizInput;
  setDraft: (d: QuizInput) => void;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const setQ = (i: number, patch: Partial<QuizQuestionInput>) =>
    setDraft({ ...draft, questions: draft.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const problem = draftProblem(draft);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? "Edit quiz" : "New quiz"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="quiz-title">Title</Label>
          <Input
            id="quiz-title"
            value={draft.title}
            maxLength={200}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Opening night trivia"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.speedBonus}
            onChange={(e) => setDraft({ ...draft, speedBonus: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          Speed bonus: right answers earn up to 50% more the faster they come in
        </label>

        {draft.questions.map((q, i) => (
          <fieldset key={i} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-sm font-medium text-foreground">Question {i + 1}</legend>
              {draft.questions.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Input
              value={q.prompt}
              maxLength={300}
              aria-label={`Question ${i + 1}`}
              onChange={(e) => setQ(i, { prompt: e.target.value })}
              placeholder="Which planet is closest to the sun?"
            />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Tick the right answer. Tick more than one if any of them counts.</p>
              {q.options.map((o, k) => {
                const right = q.correctIndexes.includes(k);
                return (
                  <div key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={right}
                      aria-label={`Option ${k + 1} is a right answer`}
                      onChange={() =>
                        setQ(i, {
                          correctIndexes: right ? q.correctIndexes.filter((c) => c !== k) : [...q.correctIndexes, k],
                        })
                      }
                      className="h-4 w-4 shrink-0 rounded border-border"
                    />
                    <Input
                      value={o}
                      maxLength={120}
                      aria-label={`Question ${i + 1}, option ${k + 1}`}
                      onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })}
                      placeholder={`Option ${k + 1}`}
                    />
                    {q.options.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove option ${k + 1}`}
                        onClick={() =>
                          setQ(i, {
                            options: q.options.filter((_, j) => j !== k),
                            // Indexes after the removed option shift down by one.
                            correctIndexes: q.correctIndexes.filter((c) => c !== k).map((c) => (c > k ? c - 1 : c)),
                          })
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {q.options.length < 6 && (
                <Button variant="outline" size="sm" onClick={() => setQ(i, { options: [...q.options, ""] })}>
                  <Plus className="h-4 w-4" /> Add option
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Time
                <select
                  value={q.timeLimitSec}
                  onChange={(e) => setQ(i, { timeLimitSec: Number(e.target.value) })}
                  className={SELECT}
                >
                  {TIME_LIMITS.map((s) => (
                    <option key={s} value={s}>
                      {s} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Points
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  step={10}
                  value={q.points}
                  onChange={(e) => setQ(i, { points: Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0))) })}
                  className="w-24"
                />
              </label>
            </div>
          </fieldset>
        ))}

        {draft.questions.length < 50 && (
          <Button variant="outline" onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })}>
            <Plus className="h-4 w-4" /> Add question
          </Button>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onSave} disabled={!!problem || saving}>
            {editing ? "Save changes" : "Save as draft"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {problem && <span className="text-xs text-muted-foreground">{problem}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function QuizCard({
  quiz: z,
  eventId,
  busy,
  run,
  skew,
  onEdit,
}: {
  quiz: ManagedQuiz;
  eventId: string;
  busy: string | null;
  run: Run;
  skew: number;
  onEdit: () => void;
}) {
  const badge =
    z.status === "LIVE" ? (
      <Badge variant="success">Live</Badge>
    ) : z.status === "ENDED" ? (
      <Badge variant="neutral">Ended</Badge>
    ) : (
      <Badge variant="outline">Draft</Badge>
    );
  const current = z.status === "LIVE" && z.currentIndex !== null ? z.questions[z.currentIndex] : null;
  const isLast = z.currentIndex !== null && z.currentIndex + 1 >= z.questions.length;
  const busyHere = busy === z.id;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">{z.title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {z.questions.length} question{z.questions.length === 1 ? "" : "s"}
            {z.speedBonus ? " · speed bonus" : ""}
            {z.leaderboard ? ` · ${z.leaderboard.players} playing` : ""}
          </p>
        </div>
        {badge}
      </CardHeader>
      <CardContent className="space-y-5">
        {current && <LiveQuestion question={current} total={z.questions.length} skew={skew} />}

        <div className="flex flex-wrap items-center gap-2">
          {z.status === "DRAFT" && (
            <>
              <Button size="sm" disabled={busyHere} onClick={() => run(z.id, () => startQuiz(eventId, z.id))}>
                Start quiz
              </Button>
              <Button size="sm" variant="outline" disabled={busyHere} onClick={onEdit}>
                <PencilSimple className="h-4 w-4" /> Edit
              </Button>
            </>
          )}
          {current && !current.closed && (
            <Button size="sm" variant="secondary" disabled={busyHere} onClick={() => run(z.id, () => closeQuestion(eventId, z.id))}>
              Close question now
            </Button>
          )}
          {current && !isLast && (
            <Button size="sm" disabled={busyHere} onClick={() => run(z.id, () => nextQuestion(eventId, z.id))}>
              Next question
            </Button>
          )}
          {z.status === "LIVE" && (
            <Button
              size="sm"
              variant={isLast && current?.closed ? "default" : "outline"}
              disabled={busyHere}
              onClick={() =>
                (isLast || window.confirm("End the quiz now? Questions not yet asked are skipped.")) &&
                run(z.id, () => endQuiz(eventId, z.id))
              }
            >
              End quiz and show results
            </Button>
          )}
          {z.status !== "LIVE" && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete quiz"
              disabled={busyHere}
              onClick={() => window.confirm("Delete this quiz and its answers?") && run(z.id, () => deleteQuiz(eventId, z.id))}
            >
              <Trash className="h-4 w-4" />
            </Button>
          )}
        </div>

        {z.leaderboard && <Board board={z.leaderboard} final={z.status === "ENDED"} />}

        {z.status === "DRAFT" && (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {z.questions.map((q) => (
              <li key={q.id}>
                {q.prompt} <span className="text-xs">({q.timeLimitSec}s · {q.points} pts)</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** The open question for the organiser: countdown, answers in, then the spread with the right one marked. */
function LiveQuestion({ question: q, total, skew }: { question: ManagedQuiz["questions"][number]; total: number; skew: number }) {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew), 250);
    return () => clearInterval(t);
  }, [skew]);

  const opensIn = q.openedAt ? Math.ceil((new Date(q.openedAt).getTime() - now) / 1000) : 0;
  const left = q.closesAt ? Math.max(0, Math.ceil((new Date(q.closesAt).getTime() - now) / 1000)) : 0;
  const max = Math.max(1, ...q.results);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>
          Question {q.position + 1} of {total}
        </span>
        <span className="tabular-nums" aria-live="polite">
          {q.closed ? "Closed" : opensIn > 0 ? `Starts in ${opensIn}s` : `${left}s left`} · {q.answered} answered
        </span>
      </div>
      <p className="text-base font-medium text-foreground">{q.prompt}</p>
      <ul className="space-y-2">
        {q.options.map((o, i) => {
          const right = q.correctIndexes.includes(i);
          const n = q.results[i] ?? 0;
          return (
            <li key={i} className="space-y-1">
              <div className="flex justify-between gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-foreground">
                  {right && <Check className="h-4 w-4 text-success" aria-label="Right answer" />}
                  {o}
                </span>
                {/* The spread waits for close, so a projected screen can't give it away. */}
                {q.closed && <span className="tabular-nums text-muted-foreground">{n}</span>}
              </div>
              {q.closed && (
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full transition-[width] ${right ? "bg-success" : "bg-primary/40"}`}
                    style={{ width: `${(n / max) * 100}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Board({ board, final }: { board: Leaderboard; final: boolean }) {
  if (!board.top.length) {
    return <p className="text-sm text-muted-foreground">The leaderboard fills in after the first question closes.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{final ? "Final leaderboard" : "Leaderboard"}</p>
      <ol className="divide-y divide-border rounded-lg border border-border">
        {board.top.map((r, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-6 tabular-nums text-muted-foreground">{r.rank}</span>
            <span className="flex-1 text-foreground">{r.name}</span>
            <span className="tabular-nums font-medium text-foreground">{r.score.toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
