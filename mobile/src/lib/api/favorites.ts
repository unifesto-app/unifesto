import { makeAuthenticatedRequest } from './helpers';
import { Event } from './events';

/**
 * Favourite (saved) events. All endpoints are auth-scoped to the caller.
 * Reads degrade gracefully (empty result on failure); writes surface success
 * as a boolean so callers can reconcile optimistic UI.
 */

/** The user's favourited events, newest first. */
export async function getFavorites(): Promise<Event[]> {
  const response = await makeAuthenticatedRequest('/favorites');
  if (!response?.ok) return [];
  try {
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Ids of the user's favourited events — used to mark hearts across the app. */
export async function getFavoriteIds(): Promise<string[]> {
  const response = await makeAuthenticatedRequest('/favorites/ids');
  if (!response?.ok) return [];
  try {
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Add an event to favourites. Returns true on success. */
export async function addFavorite(eventId: string): Promise<boolean> {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/favorite`, {
    method: 'POST',
  });
  return !!response?.ok;
}

/** Remove an event from favourites. Returns true on success. */
export async function removeFavorite(eventId: string): Promise<boolean> {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/favorite`, {
    method: 'DELETE',
  });
  return !!response?.ok;
}
