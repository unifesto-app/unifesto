import { makeAuthenticatedRequest } from './helpers';

export type ManagedEventStatus = 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED' | string;

/** One row of GET /events/space/:spaceId — only the fields the manage screen reads. */
export interface ManagedEvent {
  id: string;
  title: string;
  slug: string;
  status: ManagedEventStatus;
  startDateTime: string;
  endDateTime: string;
  coverImageUrl: string | null;
  venueName: string | null;
  city: string | null;
  capacity: number | null;
  isCoHost: boolean;
  /** Set when this event is a sub-event of a big event. */
  parentEventId?: string | null;
  /** People attending (individual + inside groups), not booking rows. */
  attendees: { total: number; individual: number; groupAttendees: number; groups: number };
  _count?: { registrations: number; childEvents: number };
  /** Visible, active ticket prices (Decimal strings) — used to tell paid events apart. */
  ticketTypes?: { price: string | number; currency: string }[];
  updatedAt: string;
}

/**
 * Every event a space owns or co-hosts, drafts included — the same list the
 * Space web dashboard renders. Throws so the screen can offer a retry.
 */
export async function getManagedSpaceEvents(spaceId: string): Promise<ManagedEvent[]> {
  const response = await makeAuthenticatedRequest(`/events/space/${spaceId}?limit=100`);
  if (!response?.ok) throw new Error('Could not load events');
  const body = await response.json();
  return Array.isArray(body?.data) ? (body.data as ManagedEvent[]) : [];
}

export interface SpaceTeamMember {
  id: string;
  user: { id: string; fullName: string | null; username: string | null; avatarUrl: string | null };
  role: { code: string; name: string };
}

/**
 * GET /spaces/:id/members — Space Admin only (`space:manage-members`). Returns
 * null on 403 or any failure, so the Team section just doesn't render.
 */
export async function getSpaceTeam(
  spaceId: string,
): Promise<{ total: number; members: SpaceTeamMember[] } | null> {
  const response = await makeAuthenticatedRequest(`/spaces/${spaceId}/members?limit=8`);
  if (!response?.ok) return null;
  try {
    const body = await response.json();
    // Paginated shape today; older servers returned a bare array.
    if (Array.isArray(body)) return { total: body.length, members: body.slice(0, 8) };
    return { total: body?.pagination?.total ?? 0, members: body?.members ?? [] };
  } catch {
    return null;
  }
}
