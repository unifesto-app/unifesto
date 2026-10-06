/**
 * Hackathon mode — pure rules, no Prisma (docs/hackathon-mobile-plan.md).
 *
 * Everything here decides *what* should happen (which code a team gets, what
 * its name is, which room it lands in, what stage it's at); the services only
 * load rows and write the result. Kept pure so hackathon.shared.spec.ts can pin
 * the rules exactly.
 */

import type { HackathonPsMode, HackathonTeamNameSource, HackathonThemeMode } from '@prisma/client';

/** Team ID prefix: starts with a letter/digit; letters, digits and - _ / . after. */
export const TEAM_CODE_PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9_\-/.]{0,19}$/;
/** A full Team ID the curator types by hand (spaces and # allowed inside). */
export const TEAM_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-/.#]{0,39}$/;
export const TEAM_CODE_DIGITS_MIN = 1;
export const TEAM_CODE_DIGITS_MAX = 6;
export const TEAM_NAME_MAX = 80;

/** HACK25- + 3 + 7 → "HACK25-007". Numbers wider than `digits` are not cut. */
export function formatTeamCode(prefix: string, digits: number, n: number): string {
  return `${prefix}${String(n).padStart(digits, '0')}`;
}

/** Collapse whitespace; null when nothing is left. */
export function cleanName(raw: unknown, max = TEAM_NAME_MAX): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** "<Lead>'s team", or "Team <code>" when the lead has no name on file. */
export function defaultTeamName(leadName: string | null | undefined, teamCode: string): string {
  const lead = cleanName(leadName, TEAM_NAME_MAX - 7);
  return lead ? `${lead}'s team` : `Team ${teamCode}`;
}

/**
 * The imported team's name: the answer to the curator's linked per-group
 * registration question if there is one, otherwise the default.
 */
export function initialTeamName(opts: {
  formResponses: unknown;
  teamNameFieldId: string | null;
  leadName: string | null;
  teamCode: string;
}): { name: string; source: HackathonTeamNameSource } {
  if (opts.teamNameFieldId && opts.formResponses && typeof opts.formResponses === 'object') {
    const answer = cleanName((opts.formResponses as Record<string, unknown>)[opts.teamNameFieldId]);
    if (answer) return { name: answer, source: 'FORM' };
  }
  return { name: defaultTeamName(opts.leadName, opts.teamCode), source: 'DEFAULT' };
}

export interface ImportCandidate {
  registrationId: string;
  leadName: string | null;
  formResponses: unknown;
}

export interface PlannedTeam {
  registrationId: string;
  teamCode: string;
  teamSeq: number;
  name: string;
  nameSource: HackathonTeamNameSource;
}

/**
 * Decide the teams an import creates. `candidates` must already be the event's
 * attending GROUP registrations in import order (earliest booking first).
 *
 * - A registration that already has a team is skipped (re-import is safe).
 * - Numbers come from `next` upwards and skip any code already taken on the
 *   board (e.g. one a curator typed by hand), so a code is never handed out
 *   twice — not even one belonging to a cancelled team.
 */
export function planTeamImport(opts: {
  candidates: ImportCandidate[];
  linkedRegistrationIds: ReadonlySet<string>;
  usedCodes: ReadonlySet<string>;
  prefix: string;
  digits: number;
  next: number;
  teamNameFieldId: string | null;
}): { teams: PlannedTeam[]; skipped: number; next: number } {
  const used = new Set(opts.usedCodes);
  let next = opts.next;
  let skipped = 0;
  const teams: PlannedTeam[] = [];
  for (const c of opts.candidates) {
    if (opts.linkedRegistrationIds.has(c.registrationId)) {
      skipped++;
      continue;
    }
    let code = formatTeamCode(opts.prefix, opts.digits, next);
    while (used.has(code)) {
      next++;
      code = formatTeamCode(opts.prefix, opts.digits, next);
    }
    used.add(code);
    const { name, source } = initialTeamName({
      formResponses: c.formResponses,
      teamNameFieldId: opts.teamNameFieldId,
      leadName: c.leadName,
      teamCode: code,
    });
    teams.push({ registrationId: c.registrationId, teamCode: code, teamSeq: next, name, nameSource: source });
    next++;
  }
  return { teams, skipped, next };
}

export interface RoomSlot {
  id: string;
  capacity: number;
  /** Non-cancelled teams already in the room. */
  occupied: number;
}

/**
 * Fill rooms in order with the given unallocated teams (already in Team ID
 * order). Rooms keep the teams they have; only free places are filled. Teams
 * that don't fit anywhere are returned as `unplaced`.
 */
export function planRoomAllocation(
  rooms: RoomSlot[],
  teamIds: string[],
): { assignments: { teamId: string; roomId: string }[]; unplaced: string[] } {
  const assignments: { teamId: string; roomId: string }[] = [];
  let t = 0;
  for (const room of rooms) {
    let free = Math.max(0, room.capacity - room.occupied);
    while (free > 0 && t < teamIds.length) {
      assignments.push({ teamId: teamIds[t++], roomId: room.id });
      free--;
    }
  }
  return { assignments, unplaced: teamIds.slice(t) };
}

/**
 * Where a team is in the hackathon (plan §5): cancelled, still choosing its
 * problem statement, in (statement locked), or out. Elimination arrives with
 * the scoring phase and slots into the same function.
 */
export type TeamStage = 'CANCELLED' | 'NEEDS_PS' | 'ACTIVE' | 'ELIMINATED';

export function teamStage(t: {
  cancelled: boolean;
  statementLockedAt?: Date | null;
  eliminated?: boolean;
}): TeamStage {
  if (t.cancelled) return 'CANCELLED';
  if (!t.statementLockedAt) return 'NEEDS_PS';
  return t.eliminated ? 'ELIMINATED' : 'ACTIVE';
}

/** Natural order for teams: import number, then code (hand-typed codes last). */
export function compareTeams(
  a: { teamSeq: number | null; teamCode: string | null },
  b: { teamSeq: number | null; teamCode: string | null },
): number {
  const sa = a.teamSeq ?? Number.MAX_SAFE_INTEGER;
  const sb = b.teamSeq ?? Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  return (a.teamCode ?? '').localeCompare(b.teamCode ?? '', undefined, { numeric: true });
}

// ── Problem statements & themes (plan §2 #7–#10, §3 #5–#6) ──────────────────

export const THEME_NAME_MAX = 60;
export const STATEMENT_CODE_MAX = 20;
export const STATEMENT_TITLE_MAX = 200;
export const STATEMENT_TEXT_MAX = 4000;
/** A statement code: letters, digits and - _ / . #, starting with a letter or digit. */
export const STATEMENT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_\-/.#]{0,19}$/;

/** "PS-01", "PS-02", … — the first free one after the highest numbered code. */
export function nextStatementCode(existing: string[]): string {
  const taken = new Set(existing.map((c) => c.toUpperCase()));
  let n = existing.reduce((max, c) => {
    const m = /^PS-(\d+)$/i.exec(c);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0) + 1;
  while (taken.has(`PS-${String(n).padStart(2, '0')}`)) n++;
  return `PS-${String(n).padStart(2, '0')}`;
}

/** Why a team can't lock in a problem statement itself right now (null = it can). */
export type StatementBlock = 'LOCKED' | 'NOT_OPEN' | 'CURATOR_ASSIGNS' | 'DEADLINE_PASSED';

/**
 * Whether the team may choose (write or pick) its own statement. Teams choose
 * only in TEAM_WRITES / TEAM_PICKS, only before the deadline, and only once:
 * it locks on submit, after which only the curator changes it.
 */
export function statementBlock(opts: {
  psMode: HackathonPsMode | null;
  psDeadline: Date | null;
  lockedAt: Date | null;
  now: Date;
}): StatementBlock | null {
  if (opts.lockedAt) return 'LOCKED';
  if (!opts.psMode) return 'NOT_OPEN';
  if (opts.psMode === 'CURATOR_ASSIGNS') return 'CURATOR_ASSIGNS';
  if (opts.psDeadline && opts.now >= opts.psDeadline) return 'DEADLINE_PASSED';
  return null;
}

/**
 * The team's theme, from what was sent and how the board asks for themes.
 * A statement from the list that has a theme decides it outright. Otherwise:
 * LIST mode needs one of the curator's themes (unless there are none yet);
 * TEXT mode needs a short free-text theme. Returns an error message instead
 * when the input doesn't fit.
 */
export function resolveTheme(opts: {
  themeMode: HackathonThemeMode;
  themeIds: ReadonlySet<string>;
  statementThemeId: string | null;
  themeId?: string | null;
  themeText?: string | null;
}): { themeId: string | null; themeText: string | null } | { error: string } {
  if (opts.statementThemeId) return { themeId: opts.statementThemeId, themeText: null };
  if (opts.themeMode === 'TEXT') {
    const text = cleanName(opts.themeText, THEME_NAME_MAX);
    if (!text) return { error: 'Add your theme or domain, like "HealthTech".' };
    return { themeId: null, themeText: text };
  }
  if (opts.themeId) {
    if (!opts.themeIds.has(opts.themeId)) return { error: 'That theme is no longer on the list. Pick another.' };
    return { themeId: opts.themeId, themeText: null };
  }
  if (opts.themeIds.size) return { error: 'Pick a theme.' };
  return { themeId: null, themeText: null };
}

/** Places left on a statement, or null when it has no limit. */
export function placesLeft(maxTeams: number | null, taken: number): number | null {
  return maxTeams == null ? null : Math.max(0, maxTeams - taken);
}

/**
 * Whether the "1 hour left" reminder should go out now: teams choose their own
 * statements, the deadline is within the hour and still ahead, and this
 * deadline hasn't been reminded about yet (moving it re-arms the reminder).
 */
export function deadlineReminderDue(opts: {
  psMode: HackathonPsMode | null;
  psDeadline: Date | null;
  remindedFor: Date | null;
  now: Date;
}): boolean {
  if (!opts.psDeadline || (opts.psMode !== 'TEAM_WRITES' && opts.psMode !== 'TEAM_PICKS')) return false;
  const msLeft = opts.psDeadline.getTime() - opts.now.getTime();
  if (msLeft <= 0 || msLeft > 60 * 60 * 1000) return false;
  return !opts.remindedFor || opts.remindedFor.getTime() !== opts.psDeadline.getTime();
}

// ── Judges, rounds and the evaluation queue (plan §2 #11–#19, §7, §8) ───────

export type EvalStatus =
  | 'WAITING'
  | 'CALLED'
  | 'IN_PROGRESS'
  | 'AWAITING_MARKS'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'WITHDRAWN'
  | 'CANCELLED';

/** A request in one of these is "open": the team has at most one. */
export const OPEN_EVAL_STATUSES = ['WAITING', 'CALLED', 'IN_PROGRESS', 'AWAITING_MARKS'] as const;
/** The judge (or panel) is busy with this team: Call next waits for it. */
export const SLOT_EVAL_STATUSES = ['CALLED', 'IN_PROGRESS', 'AWAITING_MARKS'] as const;

export const isOpenStatus = (s: EvalStatus) => (OPEN_EVAL_STATUSES as readonly string[]).includes(s);
export const isSlotStatus = (s: EvalStatus) => (SLOT_EVAL_STATUSES as readonly string[]).includes(s);

/** How long a judge may still change submitted marks (plan §2 #17). */
export const EDIT_WINDOW_MS = 5 * 60 * 1000;
export const SLOT_MINUTES_MAX = 240;
export const CALL_GRACE_MINUTES_MAX = 60;
export const REQUIRED_EVALUATIONS_MAX = 10;

/**
 * The status to show and act on. A running slot whose time is up is
 * AWAITING_MARKS even before the 30-second tick writes it down.
 */
export function effectiveStatus(r: { status: EvalStatus; slotEndsAt: Date | null }, now: Date): EvalStatus {
  if (r.status === 'IN_PROGRESS' && r.slotEndsAt && r.slotEndsAt.getTime() <= now.getTime()) return 'AWAITING_MARKS';
  return r.status;
}

/** When a called team's grace runs out and the judge may mark it a no-show. */
export function graceEndsAt(calledAt: Date | null, graceMinutes: number): Date | null {
  return calledAt ? new Date(calledAt.getTime() + graceMinutes * 60_000) : null;
}

/**
 * Until when a judge can still change their submitted marks: five minutes from
 * the first submit, or from the curator reopening them, whichever is later.
 * Null while nothing has been submitted (drafts are always editable).
 */
export function editableUntil(j: { submittedAt: Date | null; reopenedAt: Date | null }): Date | null {
  if (!j.submittedAt) return null;
  const from = j.reopenedAt && j.reopenedAt > j.submittedAt ? j.reopenedAt : j.submittedAt;
  return new Date(from.getTime() + EDIT_WINDOW_MS);
}

export function judgmentLocked(j: { submittedAt: Date | null; reopenedAt: Date | null }, now: Date): boolean {
  const until = editableUntil(j);
  return !!until && now.getTime() >= until.getTime();
}

export type RoundKind = 'EVALUATION' | 'MENTORING';

/**
 * Completed sessions a team needs (or may have) in a round: one, N for MULTI,
 * and for a MENTORING round the number of mentor sessions it allows.
 */
export function evaluationsRequired(round: {
  kind?: RoundKind;
  judgingMode: 'SINGLE' | 'PANEL' | 'MULTI';
  requiredEvaluations: number;
}): number {
  if (round.kind === 'MENTORING') return Math.max(1, round.requiredEvaluations);
  return round.judgingMode === 'MULTI' ? Math.max(1, round.requiredEvaluations) : 1;
}

/** Settings that can't stand together; null when fine. */
export function roundConfigError(r: { kind?: RoundKind; judgingMode: 'SINGLE' | 'PANEL' | 'MULTI'; requiredEvaluations: number }): string | null {
  if (r.kind === 'MENTORING') {
    if (r.judgingMode === 'PANEL') return 'Mentoring rounds use mentors one at a time, not panels.';
    if (r.requiredEvaluations < 1 || r.requiredEvaluations > REQUIRED_EVALUATIONS_MAX) {
      return `A team can have between 1 and ${REQUIRED_EVALUATIONS_MAX} mentor sessions.`;
    }
    return null;
  }
  if (r.judgingMode === 'MULTI' && (r.requiredEvaluations < 2 || r.requiredEvaluations > REQUIRED_EVALUATIONS_MAX)) {
    return `With several judges, each team needs between 2 and ${REQUIRED_EVALUATIONS_MAX} evaluations.`;
  }
  return null;
}

export type RoundStanding = 'PENDING' | 'ADVANCED' | 'ELIMINATED';

export interface RoundRef {
  id: string;
  order: number;
  eliminationEnabled: boolean;
}

/**
 * Whether a team takes part in `roundId` (plan §9): it wasn't eliminated
 * earlier, and it advanced from the latest earlier round that eliminates
 * (with none, every team takes part). The team's own decision in this round
 * doesn't matter here.
 */
export function takesPart(
  rounds: RoundRef[],
  standing: (roundId: string) => RoundStanding,
  roundId: string,
): { in: true } | { in: false; reason: 'ELIMINATED' | 'NOT_ADVANCED' } {
  const target = rounds.find((r) => r.id === roundId);
  if (!target) return { in: false, reason: 'NOT_ADVANCED' };
  const earlier = rounds.filter((r) => r.order < target.order).sort((a, b) => a.order - b.order);
  if (earlier.some((r) => standing(r.id) === 'ELIMINATED')) return { in: false, reason: 'ELIMINATED' };
  const gate = [...earlier].reverse().find((r) => r.eliminationEnabled);
  if (gate && standing(gate.id) !== 'ADVANCED') return { in: false, reason: 'NOT_ADVANCED' };
  return { in: true };
}

/** Eliminated in any round: the team's run has ended. */
export function isEliminated(rounds: RoundRef[], standing: (roundId: string) => RoundStanding): boolean {
  return rounds.some((r) => standing(r.id) === 'ELIMINATED');
}

/**
 * Teams still waiting for an advance/eliminate decision in a round before
 * `roundId` that eliminates (plan §2 #33). Opening `roundId` is refused while
 * this is non-empty. Only teams that took part in that round count.
 */
export function undecidedBefore(
  rounds: RoundRef[],
  teams: { id: string; standing: (roundId: string) => RoundStanding }[],
  roundId: string,
): { roundId: string; teamIds: string[] }[] {
  const target = rounds.find((r) => r.id === roundId);
  if (!target) return [];
  const out: { roundId: string; teamIds: string[] }[] = [];
  for (const r of rounds.filter((x) => x.order < target.order && x.eliminationEnabled).sort((a, b) => a.order - b.order)) {
    const teamIds = teams
      .filter((t) => takesPart(rounds, t.standing, r.id).in && t.standing(r.id) === 'PENDING')
      .map((t) => t.id);
    if (teamIds.length) out.push({ roundId: r.id, teamIds });
  }
  return out;
}

/** A judge takes a team if they take any theme, or the team's theme. Text themes match everyone. */
export function judgeTakesTheme(judgeThemeIds: readonly string[], teamThemeId: string | null): boolean {
  return judgeThemeIds.length === 0 || !teamThemeId || judgeThemeIds.includes(teamThemeId);
}

/** Rough wait: the teams ahead plus the one in the slot, one slot each. */
export function estimatedWaitMinutes(ahead: number, busy: boolean, slotMinutes: number): number {
  return (ahead + (busy ? 1 : 0)) * slotMinutes;
}

/**
 * A typed phone number as accounts store it (E.164). Ten digits are taken as
 * an Indian number, as the app's sign-in does; a leading `00` (international
 * prefix) reads as `+`, and a single leading trunk `0` is dropped. Null when
 * it can't be a number. Used for judges and to match leads on account close.
 */
export function normalizeMobile(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (s.startsWith('0')) s = s.slice(1);
  if (/^\d{10}$/.test(s)) return `+91${s}`;
  if (/^91\d{10}$/.test(s)) return `+${s}`;
  if (/^\+[1-9]\d{6,14}$/.test(s)) return s;
  return null;
}

/** A stable criterion key from its label, unique on the board ("innovation", "innovation-2"). */
export function criterionKey(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'criterion';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ── Scoring, results and export (plan §9) ───────────────────────────────────

/** A mark counts only once its judge has submitted the evaluation it belongs to. */
export const submittedKey = (roundId: string, entrantId: string, judgeUserId: string) => `${roundId}:${entrantId}:${judgeUserId}`;

/**
 * The round a PER_ROUND hackathon is ranked on: the latest round that has
 * been opened (a round still waiting to start has no marks yet), else the last.
 */
export function finalRoundId(
  rounds: { id: string; order: number; status: 'PENDING' | 'ACTIVE' | 'CLOSED'; kind?: RoundKind }[],
): string | null {
  // Mentoring rounds have no marks, so they never decide the ranking.
  const sorted = rounds.filter((r) => r.kind !== 'MENTORING').sort((a, b) => a.order - b.order);
  const started = sorted.filter((r) => r.status !== 'PENDING');
  return (started[started.length - 1] ?? sorted[sorted.length - 1])?.id ?? null;
}

/** CUMULATIVE: a team's total is the plain sum of its scores in the rounds that count. */
export function cumulativeTotal(roundScores: ReadonlyMap<string, number>, countedRoundIds: ReadonlySet<string>): number {
  let total = 0;
  for (const [roundId, score] of roundScores) if (countedRoundIds.has(roundId)) total += score;
  return Math.round(total * 1e4) / 1e4;
}

/**
 * Standard competition ranks, highest score first (1, 2, 2, 4). Items with no
 * score (null) are left unranked at the end.
 */
export function competitionRanks<T extends { score: number | null }>(items: T[]): (T & { rank: number | null })[] {
  const scored = items.filter((i) => i.score != null).sort((a, b) => b.score! - a.score!);
  const out: (T & { rank: number | null })[] = [];
  scored.forEach((item, i) => {
    const prev = out[i - 1];
    out.push({ ...item, rank: prev && prev.score === item.score ? prev.rank : i + 1 });
  });
  return [...out, ...items.filter((i) => i.score == null).map((i) => ({ ...i, rank: null }))];
}

/** One evaluation's weighted total: Σ weight × mark over the criteria marked. */
export function evaluationTotal(marks: { metricId: string; value: number }[], weights: ReadonlyMap<string, number>): number {
  const t = marks.reduce((sum, m) => sum + (weights.get(m.metricId) ?? 0) * m.value, 0);
  return Math.round(t * 1e4) / 1e4;
}

/**
 * The "top N" split for a round (plan §9): the best N teams advance, the rest
 * are eliminated. Teams tied with the Nth go through too, so nobody is cut on
 * a tie; `tiedAtCut` says how many extra that let in. Unscored teams never advance.
 */
export function topNSplit(teams: { id: string; score: number | null }[], n: number): { advance: string[]; eliminate: string[]; tiedAtCut: number } {
  const ranked = competitionRanks(teams);
  const cutScore = ranked.filter((t) => t.rank != null)[n - 1]?.score ?? null;
  const advance = ranked.filter((t, i) => t.rank != null && (i < n || (cutScore != null && t.score === cutScore))).map((t) => t.id);
  const set = new Set(advance);
  return {
    advance,
    eliminate: teams.filter((t) => !set.has(t.id)).map((t) => t.id),
    tiedAtCut: Math.max(0, advance.length - n),
  };
}

/**
 * One CSV cell. Quoted when needed; a leading = + - @ is prefixed with ' so a
 * spreadsheet never runs team-typed text as a formula.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A CSV document (CRLF, with a BOM so Excel reads names in any script). */
export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// ── Project links (Phase 5) ──────────────────────────────────────────────────

export const SUBMISSION_LINKS_MAX = 10;
export const SUBMISSION_LABEL_MAX = 60;
export const SUBMISSION_NOTES_MAX = 2000;

export interface SubmissionLink {
  label: string;
  url: string;
}

/**
 * Clean a team's project links: http(s) only, at most 10, blank rows dropped,
 * duplicates dropped, and a missing label taken from the site ("github.com").
 * Returns an error message instead when a link can't be used.
 */
export function cleanLinks(raw: { label?: string | null; url?: string | null }[]): { links: SubmissionLink[] } | { error: string } {
  const out: SubmissionLink[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const url = (r.url ?? '').trim();
    const label = (r.label ?? '').replace(/\s+/g, ' ').trim();
    if (!url && !label) continue;
    if (!url) return { error: `Add the link for "${label}".` };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { error: `"${url.slice(0, 60)}" isn't a link. Links start with https://` };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'Links start with https://' };
    if (url.length > 2000) return { error: 'That link is too long.' };
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    out.push({ label: (label || parsed.hostname.replace(/^www\./, '')).slice(0, SUBMISSION_LABEL_MAX), url: parsed.href });
  }
  if (out.length > SUBMISSION_LINKS_MAX) return { error: `Add at most ${SUBMISSION_LINKS_MAX} links.` };
  return { links: out };
}

/** Whether teams can still change their links for a round. */
export function submissionOpen(round: { status: 'PENDING' | 'ACTIVE' | 'CLOSED'; submissionsCloseAt: Date | null }, now: Date): boolean {
  if (round.status === 'CLOSED') return false;
  return !round.submissionsCloseAt || now.getTime() < round.submissionsCloseAt.getTime();
}

/** Stored links, tolerating anything unexpected in the JSON column. */
export function readLinks(json: unknown): SubmissionLink[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((l): l is SubmissionLink => !!l && typeof l === 'object' && typeof (l as SubmissionLink).url === 'string')
    .map((l) => ({ label: typeof l.label === 'string' ? l.label : l.url, url: l.url }));
}
