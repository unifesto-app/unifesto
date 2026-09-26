import { call } from './manageEvent';

/*
 * Co-hosting: other spaces that share management of an event, plus the
 * request/accept flow that hands the event (and its payouts) to a co-host.
 * The host space's admins invite and remove; a co-host may remove itself.
 * Offering ownership needs a Space Admin of the host; accepting needs a Space
 * Admin of the receiving space.
 */

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export interface CoHostSpace {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface PendingTransfer {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  fromSpace: CoHostSpace;
  toSpace: CoHostSpace;
}

export interface CoHosts {
  owner: CoHostSpace;
  coHosts: { id: string; createdAt: string; space: CoHostSpace }[];
  pendingTransfer: PendingTransfer | null;
}

export const getCoHosts = (eventId: string) => call<CoHosts>(`/events/${eventId}/co-hosts`);

export const addCoHost = (eventId: string, spaceId: string) =>
  call<unknown>(`/events/${eventId}/co-hosts`, json('POST', { spaceId }));

export const removeCoHost = (eventId: string, spaceId: string) =>
  call<unknown>(`/events/${eventId}/co-hosts/${spaceId}`, json('DELETE'));

export const offerOwnership = (eventId: string, toSpaceId: string, reason?: string) =>
  call<PendingTransfer>(`/events/${eventId}/co-hosts/transfer`, json('POST', { toSpaceId, reason }));

export const acceptOwnership = (eventId: string) =>
  call<unknown>(`/events/${eventId}/co-hosts/transfer/accept`, json('POST', {}));

export const declineOwnership = (eventId: string) =>
  call<unknown>(`/events/${eventId}/co-hosts/transfer/decline`, json('POST', {}));

export const cancelOwnershipOffer = (eventId: string) => call<unknown>(`/events/${eventId}/co-hosts/transfer`, json('DELETE'));

/** GET /spaces?search= — active spaces to invite. */
export async function searchSpaces(query: string) {
  const q = new URLSearchParams({ search: query, status: 'ACTIVE', page: '1', limit: '10' });
  const res = await call<{ spaces: Record<string, unknown>[] }>(`/spaces?${q.toString()}`);
  if (!res.ok) return res;
  const spaces: CoHostSpace[] = (res.data.spaces ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    slug: s.slug as string,
    logoUrl: ((s.logo_url ?? s.logoUrl) as string | null) ?? null,
  }));
  return { ok: true as const, data: spaces };
}
