import type { OperatorSpace } from './api/spaceAccess';
import type { CheckinEvent } from './api/checkin';
import type { JudgingEvent } from './api/leaderboard';
import type { PortalSponsor } from './api/sponsorPortal';

/**
 * Operator roles that earn the Space tab through a UserRole row. JUDGE/MENTOR
 * are not here on purpose: panelists live in LeaderboardPanelist, not UserRole,
 * so they are detected from their judging events instead. Platform ADMIN is
 * left out too — platform staff run things from Apex.
 */
export const HOSTING_ROLE_CODES = ['SPACE_ADMIN', 'CURATOR', 'CO_CURATOR'] as const;
export const CREW_ROLE_CODES = ['CREW'] as const;

export type SpaceSection = 'hosting' | 'checkin' | 'judging' | 'sponsoring';

export interface SpaceAccessData {
  spaces: OperatorSpace[];
  checkinEvents: CheckinEvent[];
  judgingEvents: JudgingEvent[];
  /** Sponsors whose portal I was invited to (booth scanning + their leads). */
  sponsorships: PortalSponsor[];
}

const hasCode = (space: OperatorSpace, codes: readonly string[]) =>
  (space.userRole && codes.includes(space.userRole.code)) ||
  space.eventAccess.some((e) => codes.includes(e.roleCode));

/** Spaces where I can create events: space:create-event is held by Space Admins only. */
export function adminSpaces(spaces: OperatorSpace[]): OperatorSpace[] {
  return spaces.filter((s) => s.userRole?.code === 'SPACE_ADMIN');
}

/** Spaces where the user hosts (Space Admin, or Curator/Co-Curator of an event). */
export function hostedSpaces(spaces: OperatorSpace[]): OperatorSpace[] {
  return spaces.filter((s) => hasCode(s, HOSTING_ROLE_CODES));
}

const ROLE_LABEL: Record<string, string> = {
  SPACE_ADMIN: 'Space admin',
  CURATOR: 'Curator',
  CO_CURATOR: 'Co-curator',
};

/** Highest hosting role the user holds in this space (space- or event-scoped), as a label. */
export function hostingRoleLabel(space: OperatorSpace): string | undefined {
  const codes = [space.userRole?.code, ...space.eventAccess.map((e) => e.roleCode)];
  const best = HOSTING_ROLE_CODES.find((c) => codes.includes(c));
  return best ? ROLE_LABEL[best] : undefined;
}

/**
 * Events that haven't ended yet, soonest first. A check-in event counts until
 * check-in closes: a late-running event keeps it open past its end (Q26).
 */
export function activeEvents<T extends { startDateTime: string; endDateTime: string; checkinOpenUntil?: string }>(
  events: T[],
  now: Date,
): T[] {
  return events
    .filter((e) => new Date(e.checkinOpenUntil ?? e.endDateTime).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
}

/**
 * The ordered sections the Space tab renders for this user. An empty list means
 * the user operates nothing, so the tab is hidden entirely.
 */
export function resolveSpaceSections(data: SpaceAccessData, now: Date): SpaceSection[] {
  const sections: SpaceSection[] = [];
  if (hostedSpaces(data.spaces).length > 0) sections.push('hosting');
  // Crew grants can come from a CREW role or a per-event check-in grant, so the
  // check-in list itself (not the role code) decides this section.
  const isCrew = data.spaces.some((s) => hasCode(s, CREW_ROLE_CODES));
  if (isCrew || activeEvents(data.checkinEvents, now).length > 0) sections.push('checkin');
  if (data.judgingEvents.length > 0) sections.push('judging');
  // Sponsor staff aren't operators, but booth scanning lives here too.
  if (data.sponsorships.length > 0) sections.push('sponsoring');
  return sections;
}
