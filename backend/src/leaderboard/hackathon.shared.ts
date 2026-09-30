/**
 * Hackathon mode — pure rules, no Prisma (docs/hackathon-mobile-plan.md).
 *
 * Everything here decides *what* should happen (which code a team gets, what
 * its name is, which room it lands in, what stage it's at); the services only
 * load rows and write the result. Kept pure so hackathon.shared.spec.ts can pin
 * the rules exactly.
 */

import type { HackathonTeamNameSource } from '@prisma/client';

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
 * Where a team is in the hackathon (plan §5). Phase 1 knows only
 * cancellation; the problem-statement lock and elimination arrive with the
 * later phases and slot into the same function.
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
