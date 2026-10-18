import { call } from './manageEvent';

/**
 * Space-level roles a member can hold. The backend only lets a Space Admin
 * assign these two (flat admin model); event roles (Curator, Crew…) are
 * managed per event, not here.
 */
export type SpaceMemberRole = 'SPACE_ADMIN' | 'MEMBER';

export const SPACE_ROLE_LABEL: Record<string, string> = {
  SPACE_ADMIN: 'Space admin',
  MEMBER: 'Member',
};

export interface MemberUser {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** Primary email only (0 or 1 entries). */
  identities?: { email: string | null }[];
}

/** One UserRole row: `id` is the membership id used for role changes and removal. */
export interface SpaceMember {
  id: string;
  userId: string;
  createdAt: string;
  user: MemberUser;
  role: { code: string; name: string };
}

export interface MemberPage {
  members: SpaceMember[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const memberEmail = (u: MemberUser) => u.identities?.[0]?.email ?? null;

/** GET /spaces/:id/members — Space Admin only (`space:manage-members`). */
export function getSpaceMembers(spaceId: string, opts: { page: number; search?: string; role?: SpaceMemberRole; limit?: number }) {
  const q = new URLSearchParams({ page: String(opts.page), limit: String(opts.limit ?? 30) });
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  if (opts.role) q.set('role', opts.role);
  return call<MemberPage>(`/spaces/${spaceId}/members?${q.toString()}`);
}

/** GET /spaces/:id/member-search — people not yet in the space. Needs 2+ characters. */
export const searchAddableUsers = (spaceId: string, q: string) =>
  call<{ users: MemberUser[] }>(`/spaces/${spaceId}/member-search?q=${encodeURIComponent(q.trim())}`);

/** POST /spaces/:id/members */
export const addSpaceMember = (spaceId: string, userId: string, role: SpaceMemberRole) =>
  call<{ member: SpaceMember }>(`/spaces/${spaceId}/members`, { method: 'POST', body: JSON.stringify({ userId, role }) });

/** PATCH /spaces/:id/members/:userRoleId — the space creator can't be moved below Space admin. */
export const changeSpaceMemberRole = (spaceId: string, userRoleId: string, role: SpaceMemberRole) =>
  call<{ member: SpaceMember }>(`/spaces/${spaceId}/members/${userRoleId}`, { method: 'PATCH', body: JSON.stringify({ role }) });

/** DELETE /spaces/:id/members/:userRoleId — the space creator can't be removed. */
export const removeSpaceMember = (spaceId: string, userRoleId: string) =>
  call<{ message: string }>(`/spaces/${spaceId}/members/${userRoleId}`, { method: 'DELETE' });
