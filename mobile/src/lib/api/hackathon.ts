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
    venue: Venue;
  } | null;
  eventVenue: Venue;
  counts: { teams: number; active: number; cancelled: number; unallocated: number; rooms: number };
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
  } | null;
  unreadCount: number;
}

/** The team hub, or `data: null` when the event runs no hackathon (or it's off). */
export const getMyHackathon = (eventId: string) => call<HackathonHub | null>(`/hackathon/${eventId}/me`);
export const renameMyTeam = (eventId: string, name: string) =>
  call<{ name: string }>(`/hackathon/${eventId}/me/team-name`, json('PATCH', { name }));

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
