import { makeAuthenticatedRequest } from './helpers';
import type { SpaceAccessData } from '../spaceSections';

/** One event the user operates through an event-scoped role (Curator/Co-Curator/Crew). */
export interface OperatorEventAccess {
  eventId: string;
  title: string;
  status: string;
  roleCode: string;
}

/**
 * A space the user reaches through any role, folded server-side into one entry
 * per space: `userRole` is their highest space-level role (null when they only
 * hold event roles there), `eventAccess` the events they operate.
 */
export interface OperatorSpace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  /** The space's creator (accountable payer): can't be removed or demoted. */
  creator?: { id: string } | null;
  userRole: { id: string; code: string; name: string } | null;
  eventAccess: OperatorEventAccess[];
  /** SUPER spaces have sub-spaces beneath them; REGULAR ones don't. */
  type?: 'SUPER' | 'REGULAR' | string;
}

/**
 * GET /users/me/spaces?includeEventRoles=true — the same call the Space web app
 * uses, so both apps agree on who operates what. Empty on any failure: a flaky
 * network must never surface a half-built Space tab.
 */
export async function getMyOperatorSpaces(): Promise<OperatorSpace[]> {
  const response = await makeAuthenticatedRequest('/users/me/spaces?includeEventRoles=true');
  if (!response?.ok) return [];
  try {
    const data = await response.json();
    return Array.isArray(data) ? (data as OperatorSpace[]) : [];
  } catch {
    return [];
  }
}

/**
 * GET /users/me/access — operator spaces, check-in events, judging events and
 * sponsorships in one call. `null` only when the backend predates the route
 * (404), so the caller can fall back to the four separate calls; any other
 * failure reads as "no access", as those calls did.
 */
export async function getMyAccess(): Promise<SpaceAccessData | null> {
  const response = await makeAuthenticatedRequest('/users/me/access');
  if (response?.status === 404) return null;
  const empty: SpaceAccessData = { spaces: [], checkinEvents: [], judgingEvents: [], sponsorships: [] };
  if (!response?.ok) return empty;
  try {
    const d = await response.json();
    const list = (v: unknown) => (Array.isArray(v) ? v : []);
    return {
      spaces: list(d?.spaces),
      checkinEvents: list(d?.checkinEvents),
      judgingEvents: list(d?.judgingEvents),
      sponsorships: list(d?.sponsorships),
    };
  } catch {
    return empty;
  }
}
