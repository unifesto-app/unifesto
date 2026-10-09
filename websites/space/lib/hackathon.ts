/**
 * Hackathon helpers with no React in them (shared with mobile/src/lib/hackathon.ts): the Team ID preview (mirrors the
 * backend's hackathon.shared.ts so the settings preview matches what import
 * hands out), stage copy, and the maps link for the venue.
 */

import type {
  EvalStatus,
  JudgingMode,
  PsMode,
  RoundStatus,
  Standing,
  StatementBlock,
  TeamRequest,
  TeamRound,
  TeamStage,
  ThemeMode,
  Venue,
} from './api/hackathon';

/** Same rule the server enforces for the prefix. */
export const TEAM_CODE_PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9_\-/.]{0,19}$/;

/** HACK25- + 3 + 7 → "HACK25-007". */
export function formatTeamCode(prefix: string, digits: number, n: number): string {
  return `${prefix}${String(n).padStart(digits, '0')}`;
}

/**
 * What the team hub says at each stage. While the team still needs a problem
 * statement, what it says depends on why (`block`) and on the deadline.
 */
export function stageCopy(
  stage: TeamStage,
  block: StatementBlock | null = null,
  deadline: string | null = null,
): { title: string; body: string } {
  if (stage === 'NEEDS_PS' && block !== 'NOT_OPEN') {
    if (block === 'CURATOR_ASSIGNS' || block === 'DEADLINE_PASSED') {
      return {
        title: 'Waiting for your problem statement',
        body: 'The organisers will assign your team’s problem statement. We’ll notify you.',
      };
    }
    return {
      title: 'Next: lock in your problem statement',
      body: deadline
        ? `Choose it before ${formatWhen(deadline)} to unlock the hackathon.`
        : 'Choose it to unlock the hackathon for your team.',
    };
  }
  switch (stage) {
    case 'CANCELLED':
      return {
        title: 'Registration cancelled',
        body: 'This team’s registration was cancelled. Your Team ID stays on record. Contact the organisers if this is a mistake.',
      };
    case 'NEEDS_PS':
      return {
        title: 'Next: your problem statement',
        body: 'Once problem statements open, lock one in here to unlock the hackathon. We’ll notify you.',
      };
    case 'ACTIVE':
      return { title: 'You’re in', body: 'Your problem statement is locked in. Good luck!' };
    case 'ELIMINATED':
      return { title: 'Your run has ended', body: 'Thanks for competing. Results and winners show up here.' };
  }
}

/** A maps link: the curator's own link, else coordinates, else the address. */
export function venueMapsUrl(v: Venue): string | null {
  if (v.mapUrl) return v.mapUrl;
  const label = [v.name, v.address].filter(Boolean).join(', ');
  if (v.lat != null && v.lng != null) return `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  if (!label) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
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

/** What the team's statement screen says when it can't choose (null once it's locked: the statement shows instead). */
export function blockCopy(block: StatementBlock): { title: string; body: string } | null {
  switch (block) {
    case 'NOT_OPEN':
      return { title: 'Not open yet', body: 'The organisers haven’t opened problem statements. We’ll notify you when they do.' };
    case 'CURATOR_ASSIGNS':
      return { title: 'Assigned by the organisers', body: 'The organisers will give your team its problem statement. We’ll notify you.' };
    case 'DEADLINE_PASSED':
      return {
        title: 'The deadline has passed',
        body: 'Teams can no longer choose. The organisers will assign your problem statement.',
      };
    case 'LOCKED':
      return null;
  }
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

/** "About 20 min", "Any minute", for a team's wait. */
export function waitLabel(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes <= 0) return 'Any minute';
  if (minutes < 60) return `About ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `About ${h} h${m ? ` ${m} min` : ''}`;
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

/** What the team's evaluate screen says about its open request. */
export function teamRequestCopy(r: TeamRequest): { title: string; body: string } {
  const who = r.evaluator?.name ?? 'your judge';
  const where = r.evaluator?.location ? ` at ${r.evaluator.location}` : '';
  switch (r.status) {
    case 'WAITING':
      return r.position === 1
        ? { title: 'You’re next', body: `${who} calls you next. Stay close${where ? ` to ${r.evaluator!.location}` : ''}.` }
        : { title: `Number ${r.position ?? '…'} in line`, body: `Waiting for ${who}. We’ll notify you when you’re next.` };
    case 'CALLED':
      return r.evaluator?.meetingUrl
        ? { title: 'You’re up!', body: `${who} is ready. Join the call now.` }
        : { title: 'You’re up!', body: `Go to ${who}${where} now.` };
    case 'IN_PROGRESS':
      return { title: 'Your evaluation is on', body: `You’re with ${who}. Good luck!` };
    case 'AWAITING_MARKS':
      return { title: 'Evaluation done', body: `${who} is finishing their notes.` };
    default:
      return { title: evalStatusLabel(r.status), body: '' };
  }
}

/** Why a round shows no "Join a queue" button for the team. */
export function roundBlockedCopy(r: TeamRound, hasOpenRequest: boolean): string | null {
  if (r.canRequest) return null;
  if (r.status === 'PENDING') return 'Not open yet. We’ll notify you when it opens.';
  if (r.status === 'CLOSED') return 'This round has closed.';
  if (!r.takesPart) return r.standing === 'ELIMINATED' ? 'Your team didn’t go through to this round.' : 'Your team isn’t in this round.';
  if (r.standing !== 'PENDING') return r.standing === 'ADVANCED' ? 'You’re through to the next round.' : 'Your run ended here.';
  if (r.completed >= r.required) return r.required > 1 ? `All ${r.required} evaluations done.` : 'Evaluated. Results come later.';
  if (!r.acceptingRequests) return 'This round has stopped taking new requests.';
  if (hasOpenRequest) return 'You’re already in a queue.';
  return null;
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
