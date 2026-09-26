"use client";

import { useMemo, useState } from "react";
import { ClipboardText, CheckCircle, Circle, DotsThree } from "@phosphor-icons/react";
import type {
  LeaderboardManage,
  Panelist,
  LeaderboardEntrant,
  Judgment,
} from "@/lib/api/leaderboard-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * Curator "who's reviewed whom" matrix. Read-only: `submittedAt` on a
 * `LeaderboardJudgment` is the single source of truth for "reviewed". Because
 * the curator (privacy-table row 4) sees everything, a submitted cell opens the
 * full review — overall text plus the judge's per-criterion marks.
 */
type CellState = "SUBMITTED" | "DRAFT" | "PENDING" | "OUT_OF_SCOPE";

/** A panel row covers a cell when its round/entrant scope is null (= all) or matches. */
function covers(p: Panelist, roundId: string, entrantId: string): boolean {
  return (
    (p.roundId === null || p.roundId === roundId) &&
    (p.entrantId === null || p.entrantId === entrantId)
  );
}

interface Props {
  board: LeaderboardManage;
}

export function JudgingTab({ board }: Props) {
  const [roundId, setRoundId] = useState<string>(
    board.rounds[board.rounds.length - 1]?.id ?? ""
  );
  const [detail, setDetail] = useState<{
    panelist: Panelist;
    entrant: LeaderboardEntrant;
    judgment: Judgment;
  } | null>(null);

  // Panelists who act on this round (round scope null = all rounds).
  const panelists = board.panelists.filter(
    (p) => p.roundId === null || p.roundId === roundId
  );

  // Judgments keyed by `${entrantId}:${panelistUserId}` for the selected round.
  const judgmentByKey = useMemo(() => {
    const m = new Map<string, Judgment>();
    for (const e of board.entrants) {
      for (const j of e.judgments) {
        if (j.roundId === roundId) m.set(`${e.id}:${j.panelistUserId}`, j);
      }
    }
    return m;
  }, [board.entrants, roundId]);

  const cellState = (p: Panelist, e: LeaderboardEntrant): CellState => {
    if (!covers(p, roundId, e.id)) return "OUT_OF_SCOPE";
    const j = judgmentByKey.get(`${e.id}:${p.userId}`);
    if (!j) return "PENDING";
    if (j.submittedAt) return "SUBMITTED";
    return "DRAFT";
  };

  const panelistLabel = (p: Panelist) =>
    p.user?.fullName || p.user?.username || "Invited panelist";

  const metricsForRound = board.metrics.filter(
    (m) => m.roundId === null || m.roundId === roundId
  );

  if (board.panelists.length === 0 || board.entrants.length === 0) {
    return (
      <EmptyState
        icon={ClipboardText}
        title="Nothing to track yet"
        description="Once you've added entrants and assigned judges or mentors, this matrix shows who has reviewed whom for the selected round."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Green = submitted, amber = draft in progress, grey = not started. A dash
          means the panelist isn&apos;t assigned to that entrant. Click a submitted
          cell to read the review.
        </p>
        {board.rounds.length > 0 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Round</Label>
            <Select value={roundId} onValueChange={setRoundId}>
              <SelectTrigger className="h-8 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {board.rounds.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 bg-card p-3 text-left font-medium text-muted-foreground">
                  Panelist
                </th>
                {board.entrants.map((e) => (
                  <th
                    key={e.id}
                    className="min-w-[7rem] p-3 text-left font-medium text-muted-foreground"
                  >
                    {e.name}
                  </th>
                ))}
                <th className="p-3 text-right font-medium text-muted-foreground">
                  Done
                </th>
              </tr>
            </thead>
            <tbody>
              {panelists.map((p) => {
                const inScope = board.entrants.filter((e) =>
                  covers(p, roundId, e.id)
                );
                const submitted = inScope.filter(
                  (e) => cellState(p, e) === "SUBMITTED"
                ).length;
                return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-card p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {panelistLabel(p)}
                        </span>
                        <Badge variant={p.kind === "JUDGE" ? "brand" : "neutral"}>
                          {p.kind === "JUDGE" ? "Judge" : "Mentor"}
                        </Badge>
                      </div>
                    </td>
                    {board.entrants.map((e) => {
                      const state = cellState(p, e);
                      const j = judgmentByKey.get(`${e.id}:${p.userId}`);
                      const clickable = state === "SUBMITTED" && j;
                      return (
                        <td key={e.id} className="p-3">
                          <button
                            type="button"
                            disabled={!clickable}
                            onClick={() =>
                              clickable &&
                              setDetail({ panelist: p, entrant: e, judgment: j })
                            }
                            className={clickable ? "cursor-pointer" : "cursor-default"}
                            aria-label={
                              clickable ? `Read ${panelistLabel(p)}'s review of ${e.name}` : undefined
                            }
                          >
                            <StateIcon state={state} />
                          </button>
                        </td>
                      );
                    })}
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {submitted}/{inScope.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ReviewDetailDialog
        detail={detail}
        onClose={() => setDetail(null)}
        board={board}
        metricsForRound={metricsForRound}
      />
    </div>
  );
}

function StateIcon({ state }: { state: CellState }) {
  if (state === "OUT_OF_SCOPE")
    return <span className="text-muted-foreground/50">—</span>;
  if (state === "SUBMITTED")
    return <CheckCircle className="h-5 w-5 text-success" weight="fill" />;
  if (state === "DRAFT")
    return <DotsThree className="h-5 w-5 text-warning" weight="bold" />;
  return <Circle className="h-5 w-5 text-muted-foreground/40" />;
}

function ReviewDetailDialog({
  detail,
  onClose,
  board,
  metricsForRound,
}: {
  detail: {
    panelist: Panelist;
    entrant: LeaderboardEntrant;
    judgment: Judgment;
  } | null;
  onClose: () => void;
  board: LeaderboardManage;
  metricsForRound: LeaderboardManage["metrics"];
}) {
  if (!detail) return null;
  const { panelist, entrant, judgment } = detail;
  const panelistLabel =
    panelist.user?.fullName || panelist.user?.username || "Panelist";

  // The judge's own per-criterion marks for this entrant + round.
  const cells = entrant.scores.filter(
    (s) => s.roundId === judgment.roundId && s.judgeUserId === panelist.userId
  );
  const metricLabel = (metricId: string) =>
    metricsForRound.find((m) => m.id === metricId)?.label ??
    board.metrics.find((m) => m.id === metricId)?.label ??
    "Criterion";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entrant.name}</DialogTitle>
          <DialogDescription>
            Reviewed by {panelistLabel} ({panelist.kind === "JUDGE" ? "Judge" : "Mentor"}
            )
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {panelist.kind === "JUDGE" && cells.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-eyebrow">Scores</p>
              <div className="space-y-1">
                {cells.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {metricLabel(c.metricId)}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {Number(c.value)}
                    </span>
                  </div>
                ))}
              </div>
              {cells.some((c) => c.comment) && (
                <div className="mt-2 space-y-1.5">
                  {cells
                    .filter((c) => c.comment)
                    .map((c) => (
                      <p key={c.id} className="text-xs text-muted-foreground">
                        <span className="font-medium">{metricLabel(c.metricId)}:</span>{" "}
                        {c.comment}
                      </p>
                    ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-eyebrow">Overall review</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {judgment.overallReview?.trim() || (
                <span className="text-muted-foreground">No written review.</span>
              )}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
