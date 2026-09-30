/**
 * Hackathon mode API client (docs/hackathon-mobile-plan.md).
 *
 * Curator routes live under `/events/:eventId/hackathon` (event:manage-leaderboard,
 * re-checked server-side); the team's own routes under `/hackathon/:eventId`.
 * No marks ever travel on the team path — the server never sends them.
 */

import { call, type Result } from './manageEvent';

export type TeamStage = 'CANCELLED' | 'NEEDS_PS' | 'ACTIVE' | 'ELIMINATED';
export type TeamNameSource = 'FORM' | 'LEAD' | 'CURATOR' | 'DEFAULT';
/** How teams get a problem statement; null = not open yet. */
export type PsMode = 'TEAM_WRITES' | 'TEAM_PICKS' | 'CURATOR_ASSIGNS';
/** Themes from the curator's list, or short free text. */
export type ThemeMode = 'LIST' | 'TEXT';
/** Why a team can't lock in a statement itself right now (null = it can). */
export type StatementBlock = 'LOCKED' | 'NOT_OPEN' | 'CURATOR_ASSIGNS' | 'DEADLINE_PASSED';

/** Who locked a statement in: a named team member, or the organisers. */
export interface StatementSetBy {
  kind: 'TEAM' | 'ORGANISER';
  name: string | null;
}

export interface Venue {
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  mapUrl?: string | null;
  notes?: string | null;
}

// ── Curator ──────────────────────────────────────────────────────────────────

export interface HackathonOverview {
  eventId: string;
  eventTitle: string;
  /** False when the space's plan doesn't include hackathons. */
  planAllowed: boolean;
  /** A leaderboard that isn't a hackathon; blocks switching on only if it has entrants. */
  otherBoard: { entrants: number } | null;
  /** Null until hackathon mode has been switched on once. */
  hackathon: {
    enabled: boolean;
    teamCodePrefix: string | null;
    teamCodeDigits: number;
    teamCodeNext: number;
    nextTeamCode: string | null;
    teamNameFieldId: string | null;
    psMode: PsMode | null;
    themeMode: ThemeMode;
    psDeadline: string | null;
    venue: Venue;
  } | null;
  eventVenue: Venue;
  counts: {
    teams: number;
    active: number;
    cancelled: number;
    unallocated: number;
    rooms: number;
    /** Non-cancelled teams with a locked problem statement. */
    psLocked: number;
    statements: number;
    themes: number;
  };
  teamNameFields: { id: string; label: string; ticketTypeName: string | null }[];
  groupTicketTypes: { id: string; name: string; isActive: boolean }[];
}

export interface HackathonConfigInput {
  teamCodePrefix?: string | null;
  teamCodeDigits?: number;
  teamCodeNext?: number;
  teamNameFieldId?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  venueMapUrl?: string | null;
  venueNotes?: string | null;
  psMode?: PsMode | null;
  themeMode?: ThemeMode;
  /** ISO time; null clears the deadline. */
  psDeadline?: string | null;
}

export interface TeamRow {
  id: string;
  teamCode: string | null;
  name: string;
  nameSource: TeamNameSource | null;
  stage: TeamStage;
  cancelledAt: string | null;
  room: { id: string; name: string } | null;
  registrationId: string | null;
  leadName: string | null;
  groupSize: number | null;
  /** People with an app account on the team (the lead included). */
  joinedCount: number;
  statement: {
    code: string | null;
    title: string;
    themeLabel: string | null;
    locked: boolean;
    /** The curator changed it after the team was evaluated. */
    changedAfterEval: boolean;
  } | null;
}

/** A team's problem statement in full, as the curator sees it. */
export interface TeamStatement {
  /** LIST = one from the curator's list; OWN = written by the team (or for it). */
  source: 'LIST' | 'OWN';
  statementId: string | null;
  code: string | null;
  title: string;
  description: string;
  theme: { id: string; name: string } | null;
  themeText: string | null;
  themeLabel: string | null;
  lockedAt: string | null;
  changedAfterEvalAt: string | null;
  setBy: StatementSetBy | null;
}

export interface TeamMember {
  seat: number;
  name: string | null;
  isLead: boolean;
  /** Has an app account on this seat, so they can open the hackathon. */
  joined: boolean;
  isMe?: boolean;
}

export interface TeamDetail {
  id: string;
  teamCode: string | null;
  name: string;
  nameSource: TeamNameSource | null;
  stage: TeamStage;
  cancelledAt: string | null;
  room: { id: string; name: string; location: string | null; notes: string | null } | null;
  registrationId: string | null;
  members: TeamMember[];
  statement: TeamStatement | null;
}

export interface ImportResult {
  imported: number;
  alreadyImported: number;
  individualSkipped: number;
  nextTeamCode: string;
}

export interface Room {
  id: string;
  name: string;
  location: string | null;
  capacity: number;
  notes: string | null;
  order: number;
  occupied: number;
  teams: { id: string; teamCode: string | null; name: string }[];
}

export interface RoomInput {
  name: string;
  location?: string | null;
  capacity: number;
  notes?: string | null;
}

const base = (eventId: string) => `/events/${eventId}/hackathon`;
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export const getHackathonOverview = (eventId: string) => call<HackathonOverview>(base(eventId));
export const enableHackathon = (eventId: string) => call<HackathonOverview>(`${base(eventId)}/enable`, json('POST'));
export const disableHackathon = (eventId: string) => call<HackathonOverview>(`${base(eventId)}/disable`, json('POST'));
export const updateHackathonConfig = (eventId: string, input: HackathonConfigInput) =>
  call<HackathonOverview>(`${base(eventId)}/config`, json('PATCH', input));

export const importTeams = (eventId: string, ticketTypeIds?: string[]) =>
  call<ImportResult>(`${base(eventId)}/teams/import`, json('POST', ticketTypeIds?.length ? { ticketTypeIds } : {}));
export const getTeams = (eventId: string) => call<TeamRow[]>(`${base(eventId)}/teams`);
export const getTeam = (eventId: string, teamId: string) => call<TeamDetail>(`${base(eventId)}/teams/${teamId}`);
export const updateTeam = (
  eventId: string,
  teamId: string,
  input: { teamCode?: string; name?: string; roomId?: string | null },
) => call<TeamDetail>(`${base(eventId)}/teams/${teamId}`, json('PATCH', input));

export const getRooms = (eventId: string) => call<{ unallocated: number; rooms: Room[] }>(`${base(eventId)}/rooms`);
export const createRoom = (eventId: string, input: RoomInput) => call<Room>(`${base(eventId)}/rooms`, json('POST', input));
export const updateRoom = (eventId: string, roomId: string, input: Partial<RoomInput>) =>
  call<Room>(`${base(eventId)}/rooms/${roomId}`, json('PATCH', input));
export const deleteRoom = (eventId: string, roomId: string) =>
  call<{ ok: true }>(`${base(eventId)}/rooms/${roomId}`, json('DELETE'));
export const autoAllocateRooms = (eventId: string) =>
  call<{ allocated: number; unplaced: number; unallocated: number; rooms: Room[] }>(
    `${base(eventId)}/rooms/auto-allocate`,
    json('POST'),
  );

// ── Curator: problem statements & themes ─────────────────────────────────────

export interface Theme {
  id: string;
  name: string;
  order: number;
  /** Statements on the list with this theme. */
  statements: number;
  /** Active teams with this theme. */
  teams: number;
}

export interface Statement {
  id: string;
  code: string;
  title: string;
  description: string;
  theme: { id: string; name: string } | null;
  /** Null = no limit. */
  maxTeams: number | null;
  order: number;
  taken: number;
  placesLeft: number | null;
  teams: { id: string; teamCode: string | null; name: string; locked: boolean }[];
}

export interface StatementList {
  mode: PsMode | null;
  themeMode: ThemeMode;
  deadline: string | null;
  /** What a new statement is coded if left blank. */
  nextCode: string;
  /** Teams that wrote their own statement. */
  ownStatements: number;
  statements: Statement[];
}

export interface StatementInput {
  code?: string | null;
  title: string;
  description: string;
  themeId?: string | null;
  maxTeams?: number | null;
}

/** One from the list, or the team's own (title + description); plus a theme when needed. */
export interface SetStatementInput {
  statementId?: string;
  title?: string;
  description?: string;
  themeId?: string;
  themeText?: string;
}

export const getThemes = (eventId: string) => call<Theme[]>(`${base(eventId)}/themes`);
export const createTheme = (eventId: string, name: string) =>
  call<Theme>(`${base(eventId)}/themes`, json('POST', { name }));
export const updateTheme = (eventId: string, themeId: string, name: string) =>
  call<Theme>(`${base(eventId)}/themes/${themeId}`, json('PATCH', { name }));
export const deleteTheme = (eventId: string, themeId: string) =>
  call<{ ok: true }>(`${base(eventId)}/themes/${themeId}`, json('DELETE'));

export const getStatements = (eventId: string) => call<StatementList>(`${base(eventId)}/statements`);
export const createStatement = (eventId: string, input: StatementInput) =>
  call<Statement>(`${base(eventId)}/statements`, json('POST', input));
export const updateStatement = (eventId: string, statementId: string, input: Partial<StatementInput>) =>
  call<Statement>(`${base(eventId)}/statements/${statementId}`, json('PATCH', input));
export const deleteStatement = (eventId: string, statementId: string) =>
  call<{ ok: true }>(`${base(eventId)}/statements/${statementId}`, json('DELETE'));

/** Assign or change a team's statement (locks it for the team). */
export const assignTeamStatement = (eventId: string, teamId: string, input: SetStatementInput) =>
  call<TeamDetail>(`${base(eventId)}/teams/${teamId}/statement`, json('PUT', input));
/** Clear a team's statement so it can choose again. */
export const unlockTeamStatement = (eventId: string, teamId: string) =>
  call<TeamDetail>(`${base(eventId)}/teams/${teamId}/statement/unlock`, json('POST'));

// ── Team member ──────────────────────────────────────────────────────────────

export interface HackathonHub {
  eventId: string;
  event: { title: string; startDateTime: string; endDateTime: string; coverImageUrl: string | null };
  venue: Venue;
  /** Null when the signed-in user isn't on a team. */
  team: {
    id: string;
    teamCode: string | null;
    name: string;
    nameSource: TeamNameSource | null;
    stage: TeamStage;
    isLead: boolean;
    room: { name: string; location: string | null; notes: string | null } | null;
    members: TeamMember[];
    /** What the team chose or was assigned; null until then. */
    statement: {
      source: 'LIST' | 'OWN';
      code: string | null;
      title: string;
      description: string;
      themeLabel: string | null;
      lockedAt: string | null;
      setBy: StatementSetBy | null;
    } | null;
    /** Null when the team can lock one in now. Always null for a cancelled team. */
    statementBlock: StatementBlock | null;
  } | null;
  problemStatements: { mode: PsMode | null; themeMode: ThemeMode; deadline: string | null };
  unreadCount: number;
}

/** The team's statement screen: what it can choose from, and whether this person may. */
export interface MyStatementOptions {
  mode: PsMode | null;
  themeMode: ThemeMode;
  deadline: string | null;
  cancelled: boolean;
  block: StatementBlock | null;
  /** Only the team lead locks the statement in. */
  isLead: boolean;
  themes: { id: string; name: string }[];
  /** The list, when teams pick from it. */
  statements: {
    id: string;
    code: string;
    title: string;
    description: string;
    theme: { id: string; name: string } | null;
    placesLeft: number | null;
  }[];
}

/** The team hub, or `data: null` when the event runs no hackathon (or it's off). */
export const getMyHackathon = (eventId: string) => call<HackathonHub | null>(`/hackathon/${eventId}/me`);
export const renameMyTeam = (eventId: string, name: string) =>
  call<{ name: string }>(`/hackathon/${eventId}/me/team-name`, json('PATCH', { name }));
export const getMyStatementOptions = (eventId: string) =>
  call<MyStatementOptions>(`/hackathon/${eventId}/statements`);
/** Lock in the team's statement (lead only, final). Returns the refreshed hub. */
export const lockMyStatement = (eventId: string, input: SetStatementInput) =>
  call<HackathonHub>(`/hackathon/${eventId}/me/statement`, json('POST', input));

// ── In-app notification feed ─────────────────────────────────────────────────

export interface InAppNotification {
  id: string;
  eventId: string | null;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

const feedQuery = (scope: { eventId?: string; type?: string; before?: string }) => {
  const q = new URLSearchParams();
  if (scope.eventId) q.set('eventId', scope.eventId);
  if (scope.type) q.set('type', scope.type);
  if (scope.before) q.set('before', scope.before);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const getNotifications = (scope: { eventId?: string; type?: string; before?: string }) =>
  call<{ items: InAppNotification[]; nextBefore: string | null }>(`/users/me/notifications${feedQuery(scope)}`);
export const markNotificationsRead = (scope: { eventId?: string; type?: string; ids?: string[] }): Promise<Result<{ updated: number }>> =>
  call<{ updated: number }>('/users/me/notifications/read', json('POST', scope));
