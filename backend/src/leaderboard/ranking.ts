/**
 * Leaderboard ranking engine — pure functions, no Prisma, fully unit-testable.
 *
 * Two modes share one pipeline:
 *   RUBRIC – judges score entrants against weighted criteria; an entrant's
 *            total is the weighted-criteria score averaged across the judges
 *            who scored them.
 *   METRIC – organisers enter raw values; an entrant's total is the value of
 *            the single metric flagged `isPrimary`.
 *
 * Keeping this decoupled from the database means the service can feed it plain
 * numbers and the tests can assert exact ranking behaviour without a DB.
 */

export type RankMode = 'RUBRIC' | 'METRIC';
export type TieBreak = 'EARLIEST_SUBMISSION' | 'PRIMARY_METRIC';

export interface MetricDef {
  id: string;
  weight: number;
  isPrimary: boolean;
}

export interface ScoreCell {
  metricId: string;
  /** null = organiser-entered (METRIC mode); a user id = a judge (RUBRIC). */
  judgeUserId: string | null;
  value: number;
}

export interface EntrantInput {
  entrantId: string;
  /** Epoch ms of the entrant's first score, for EARLIEST_SUBMISSION tie-break. */
  firstScoredAt: number;
  cells: ScoreCell[];
}

export interface RankedEntrant {
  entrantId: string;
  totalScore: number;
  rank: number;
}

/**
 * Compute a single entrant's total score.
 *
 * ── THIS IS THE FUNCTION TO OWN ──────────────────────────────────────────
 * You picked "weighted criteria, averaged across judges". That leaves two
 * policy knobs the rest of the platform can't decide for you:
 *
 *   1. EMPTY CELLS. If a judge scored an entrant on some criteria but skipped
 *      others, does the missing criterion count as 0 (punishes), or is it left
 *      out of that judge's weighted total (kinder, but a judge can inflate by
 *      only scoring where a team is strong)? The default below treats a
 *      missing cell as 0.
 *
 *   2. JUDGE COUNT. A team scored by 2 judges vs one scored by 3 — averaging
 *      (not summing) across judges is what keeps that fair, which is why we
 *      divide by the number of judges who scored the entrant, not by a fixed
 *      panel size. The default below divides by "judges who submitted ≥1 cell".
 *
 * Change the body to match how you want judging to feel; the tests in
 * ranking.spec.ts pin the behaviour so you can refactor with confidence.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function computeEntrantScore(
  entrant: EntrantInput,
  metrics: MetricDef[],
  mode: RankMode,
): number {
  if (mode === 'METRIC') {
    const primary = metrics.find((m) => m.isPrimary);
    if (!primary) return 0;
    // One organiser-entered row per cell; take the primary metric's value.
    const cell = entrant.cells.find((c) => c.metricId === primary.id);
    return cell ? cell.value : 0;
  }

  // RUBRIC: weighted total per judge, then averaged across judges.
  const weightById = new Map(metrics.map((m) => [m.id, m.weight]));
  const byJudge = new Map<string, number>();

  for (const cell of entrant.cells) {
    const judge = cell.judgeUserId ?? '__unattributed__';
    const weight = weightById.get(cell.metricId) ?? 0;
    byJudge.set(judge, (byJudge.get(judge) ?? 0) + weight * cell.value);
  }

  if (byJudge.size === 0) return 0;
  let sum = 0;
  for (const total of byJudge.values()) sum += total;
  return sum / byJudge.size;
}

/**
 * Rank a full field: compute every entrant's total, sort high→low, break ties,
 * and assign standard competition ranks (equal totals share a rank, and the
 * next rank skips: 1, 2, 2, 4).
 */
export function rankEntrants(
  entrants: EntrantInput[],
  metrics: MetricDef[],
  opts: { mode: RankMode; tieBreak: TieBreak; tieBreakMetricId?: string | null },
): RankedEntrant[] {
  const scored = entrants.map((e) => ({
    entrantId: e.entrantId,
    totalScore: round4(computeEntrantScore(e, metrics, opts.mode)),
    firstScoredAt: e.firstScoredAt,
    tieValue: tieBreakValue(e, opts.tieBreak, opts.tieBreakMetricId),
  }));

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    // Higher tie-break value wins; EARLIEST_SUBMISSION uses negative time so
    // an earlier (smaller) timestamp yields a larger value and ranks first.
    return b.tieValue - a.tieValue;
  });

  const ranked: RankedEntrant[] = [];
  let lastScore = Number.NaN;
  let lastTie = Number.NaN;
  let currentRank = 0;
  scored.forEach((s, i) => {
    const tiesWithPrev = s.totalScore === lastScore && s.tieValue === lastTie;
    currentRank = tiesWithPrev ? currentRank : i + 1;
    lastScore = s.totalScore;
    lastTie = s.tieValue;
    ranked.push({ entrantId: s.entrantId, totalScore: s.totalScore, rank: currentRank });
  });
  return ranked;
}

function tieBreakValue(
  entrant: EntrantInput,
  tieBreak: TieBreak,
  tieBreakMetricId?: string | null,
): number {
  if (tieBreak === 'PRIMARY_METRIC' && tieBreakMetricId) {
    // Average the tie-break metric's cells (across judges, if several).
    const cells = entrant.cells.filter((c) => c.metricId === tieBreakMetricId);
    if (cells.length === 0) return -Infinity;
    return cells.reduce((s, c) => s + c.value, 0) / cells.length;
  }
  // EARLIEST_SUBMISSION: earlier timestamp should win, so negate.
  return -entrant.firstScoredAt;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
