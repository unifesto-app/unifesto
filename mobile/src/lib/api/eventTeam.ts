import { call } from './manageEvent';

/*
 * The people running one event. Curators own it end to end, Co-Curators help
 * but can't publish, cancel or touch money, Crew only scan. Candidates are
 * members of the event's space.
 */

export type EventTeamRole = 'CURATOR' | 'CO_CURATOR' | 'CREW';

export interface TeamUser {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface TeamMember {
  userRoleId: string;
  userId: string;
  user: TeamUser;
  role: { code: string; name: string } | null;
}

export const TEAM_ROLES: { code: EventTeamRole; label: string; blurb: string }[] = [
  { code: 'CURATOR', label: 'Curator', blurb: 'Owns the event end to end' },
  { code: 'CO_CURATOR', label: 'Co-Curator', blurb: 'Helps run it, no publish, cancel or money' },
  { code: 'CREW', label: 'Crew', blurb: 'Check-in and scanning only' },
];

export const roleLabel = (code?: string | null, fallback?: string | null) =>
  TEAM_ROLES.find((r) => r.code === code)?.label ?? fallback ?? 'Member';

export const getEventTeam = (eventId: string) => call<{ members: TeamMember[] }>(`/events/${eventId}/team`);
export const searchTeamCandidates = (eventId: string, q: string) =>
  call<{ results: TeamUser[] }>(`/events/${eventId}/team/search?q=${encodeURIComponent(q)}`);
export const addTeamMember = (eventId: string, userId: string, roleCode: EventTeamRole) =>
  call<unknown>(`/events/${eventId}/team`, { method: 'POST', body: JSON.stringify({ userId, roleCode }) });
export const removeTeamMember = (eventId: string, userId: string) =>
  call<unknown>(`/events/${eventId}/team/${userId}`, { method: 'DELETE' });
