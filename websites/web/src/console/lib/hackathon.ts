/**
 * Curator-side hackathon helpers with no React in them, trimmed from
 * mobile/src/lib/hackathon.ts: the Team ID preview (mirrors the backend's
 * hackathon.shared.ts), option lists, labels and score formatting.
 */

import type { EvalStatus, JudgingMode, PsMode, RoundStatus, Standing, ThemeMode } from './api/hackathon';

/** Same rule the server enforces for the prefix. */
export const TEAM_CODE_PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9_\-/.]{0,19}$/;

/** HACK25- + 3 + 7 → "HACK25-007". */
export function formatTeamCode(prefix: string, digits: number, n: number): string {
  return `${prefix}${String(n).padStart(digits, '0')}`;
}

/** "5 of 8 joined" — people who can open the hackathon out of the team size. */
export function joinedLabel(joined: number, size: number | null): string {
  return size ? `${joined} of ${size} joined` : `${joined} joined`;
}

/** "Sat 4 Oct, 6:00 pm". */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** How the curator can hand out problem statements. */
export const PS_MODE_OPTIONS: { value: PsMode | 'OFF'; label: string; hint: string }[] = [
  { value: 'OFF', label: 'Not open yet', hint: 'Teams wait. Open it when your list is ready.' },
  { value: 'TEAM_PICKS', label: 'Teams pick', hint: 'Each team picks one from your list.' },
  { value: 'TEAM_WRITES', label: 'Teams write', hint: 'Each team writes its own problem statement.' },
  { value: 'CURATOR_ASSIGNS', label: 'You assign', hint: 'You give each team a statement from your list.' },
];

export const THEME_MODE_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'LIST', label: 'From your list', hint: 'Teams pick one of your themes (a statement’s own theme wins).' },
  { value: 'TEXT', label: 'Teams type it', hint: 'Teams type a short theme or domain.' },
];

/** One line for the curator: how statements are handed out right now. */
export function psModeSummary(mode: PsMode | null, deadline: string | null, now = Date.now()): string {
  const option = PS_MODE_OPTIONS.find((o) => o.value === (mode ?? 'OFF'))!;
  if (!mode || mode === 'CURATOR_ASSIGNS' || !deadline) return option.label;
  return new Date(deadline).getTime() <= now
    ? `${option.label} · closed ${formatWhen(deadline)}`
    : `${option.label} · until ${formatWhen(deadline)}`;
}

/** "3 places left" / "Full" / null when there's no limit. */
export function placesLabel(placesLeft: number | null): string | null {
  if (placesLeft == null) return null;
  if (placesLeft === 0) return 'Full';
  return `${placesLeft} place${placesLeft === 1 ? '' : 's'} left`;
}

// ── Judging and the evaluation queue (Phase 3) ───────────────────────────────

/** Whole seconds from `now` until `iso` (negative once it has passed); null without a time. */
export function secondsUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - now) / 1000);
}

/** 245 → "4:05", -30 → "-0:30", 3725 → "1:02:05". */
export function formatClock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  let s = Math.abs(totalSeconds);
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${sign}${h}:${pad(m)}:${pad(sec)}` : `${sign}${m}:${pad(sec)}`;
}

export const JUDGING_MODE_OPTIONS: { value: JudgingMode; label: string; hint: string }[] = [
  { value: 'SINGLE', label: 'One judge', hint: 'Each team picks one judge and is evaluated once.' },
  { value: 'PANEL', label: 'Panel', hint: 'Judges sit together as a panel. One slot per team, every panel judge gives marks.' },
  { value: 'MULTI', label: 'Several judges', hint: 'Each team gets evaluated separately by a set number of different judges.' },
];

export function roundStatusLabel(status: RoundStatus): string {
  return status === 'ACTIVE' ? 'Open' : status === 'CLOSED' ? 'Closed' : 'Not open';
}

export function standingLabel(s: Standing): string {
  return s === 'ADVANCED' ? 'Advanced' : s === 'ELIMINATED' ? 'Eliminated' : 'Undecided';
}

/** Short queue status for curator and judge lists. */
export function evalStatusLabel(s: EvalStatus): string {
  switch (s) {
    case 'WAITING':
      return 'Waiting';
    case 'CALLED':
      return 'Called';
    case 'IN_PROGRESS':
      return 'In slot';
    case 'AWAITING_MARKS':
      return 'Marks due';
    case 'COMPLETED':
      return 'Evaluated';
    case 'NO_SHOW':
      return 'No-show';
    case 'WITHDRAWN':
      return 'Left the queue';
    case 'CANCELLED':
      return 'Removed';
  }
}

// ── Results (Phase 4) ────────────────────────────────────────────────────────

/** "26.5" / "26" — scores without trailing zeros. */
export function formatScore(n: number | null | undefined): string {
  if (n == null) return '–';
  return String(Math.round(n * 100) / 100);
}

/**
 * The "top N" split, same rule as the server's topNSplit: the best N advance
 * (teams tied with the Nth too), the rest are eliminated; unscored teams never advance.
 */
export function topNSplit(teams: { id: string; score: number | null }[], n: number): { advance: string[]; eliminate: string[]; tiedAtCut: number } {
  const scored = teams.filter((t) => t.score != null).sort((a, b) => b.score! - a.score!);
  const cut = scored[n - 1]?.score ?? null;
  const advance = scored.filter((t, i) => i < n || (cut != null && t.score === cut)).map((t) => t.id);
  const set = new Set(advance);
  return { advance, eliminate: teams.filter((t) => !set.has(t.id)).map((t) => t.id), tiedAtCut: Math.max(0, advance.length - n) };
}

export const SCORING_MODE_OPTIONS = [
  { value: 'PER_ROUND' as const, label: 'Final round decides', hint: 'The ranking follows the latest round that was opened.' },
  { value: 'CUMULATIVE' as const, label: 'Add up rounds', hint: 'Scores add up across the rounds that count toward the total.' },
];
