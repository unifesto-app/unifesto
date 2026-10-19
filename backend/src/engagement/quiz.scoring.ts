import { rankEntrants } from '../leaderboard/ranking';

/**
 * L3 quiz rules, pure so the tests can pin them. All times are the server's:
 * a client never says when it answered.
 */

/** A question shows this long before answers open, so slow phones start level. */
export const LEAD_IN_MS = 3000;
/** Answers still count this long after the deadline (the tap was in flight). */
export const GRACE_MS = 500;
/** A correct answer earns up to this share of the question's points on top, the faster the better. */
export const SPEED_BONUS_SHARE = 0.5;

/** The answer window for a question opened now. */
export function questionWindow(now: Date, timeLimitSec: number) {
  const openedAt = new Date(now.getTime() + LEAD_IN_MS);
  return {
    openedAt,
    closesAt: new Date(openedAt.getTime() + timeLimitSec * 1000),
  };
}

/** When the answers and scores for a question may be shown: deadline plus grace. */
export function revealAt(q: { closesAt: Date | null }): Date | null {
  return q.closesAt ? new Date(q.closesAt.getTime() + GRACE_MS) : null;
}

/** Closed for good: no answer can land any more, so the correct option may be shown. */
export function isClosed(q: { closesAt: Date | null }, now: Date): boolean {
  const at = revealAt(q);
  return !!at && now.getTime() >= at.getTime();
}

/**
 * Score one answer. Wrong = 0. Right = the question's points, plus (with the
 * speed bonus on) up to SPEED_BONUS_SHARE more, falling linearly to nothing at
 * the deadline. `elapsedMs` is server receipt time minus openedAt.
 */
export function scoreAnswer(
  q: { points: number; timeLimitSec: number; correctIndexes: number[] },
  optionIndex: number,
  elapsedMs: number,
  speedBonus: boolean,
): { correct: boolean; points: number } {
  const correct = q.correctIndexes.includes(optionIndex);
  if (!correct) return { correct, points: 0 };
  if (!speedBonus) return { correct, points: q.points };
  const limitMs = q.timeLimitSec * 1000;
  const left = Math.min(Math.max(limitMs - elapsedMs, 0), limitMs) / limitMs;
  return {
    correct,
    points: q.points + Math.round(q.points * SPEED_BONUS_SHARE * left),
  };
}

/**
 * Rank players by total points with the hackathon ranking engine (METRIC mode,
 * one metric). Equal totals share a rank and the next one skips: 1, 2, 2, 4.
 */
export function rankPlayers(totals: { userId: string; points: number }[]) {
  const entrants = [...totals]
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map((t) => ({
      entrantId: t.userId,
      firstScoredAt: 0, // same for all: a tie stays a tie
      cells: [{ metricId: 'points', judgeUserId: null, value: t.points }],
    }));
  return rankEntrants(
    entrants,
    [{ id: 'points', weight: 1, isPrimary: true }],
    {
      mode: 'METRIC',
      tieBreak: 'EARLIEST_SUBMISSION',
    },
  ).map((r) => ({ userId: r.entrantId, score: r.totalScore, rank: r.rank }));
}
