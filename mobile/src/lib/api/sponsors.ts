import { makeAuthenticatedRequest } from './helpers';

/**
 * Attendee-facing sponsor lead capture (P2). An attendee opts in to share their
 * contact details with a specific sponsor at an event ("I'm interested"), can
 * withdraw that consent, and can read which sponsors they have already opted
 * into so the button renders the right state.
 *
 * The backend requires a confirmed registration for the event and that the
 * sponsor is collecting leads; a 403 surfaces here as a thrown error the screen
 * turns into a friendly message.
 */

/** The eventSponsor ids the current user has opted into at this event. */
export async function getMySponsorOptIns(eventId: string): Promise<string[]> {
  const response = await makeAuthenticatedRequest(
    `/events/${eventId}/sponsors/opt-ins`,
  );
  if (!response?.ok) return [];
  try {
    const data = await response.json();
    return Array.isArray(data) ? (data as string[]) : [];
  } catch {
    return [];
  }
}

/** Share the user's details with one sponsor. Returns true on success. */
export async function optInToSponsor(
  eventId: string,
  eventSponsorId: string,
): Promise<{ ok: boolean; message?: string }> {
  const response = await makeAuthenticatedRequest(
    `/events/${eventId}/sponsors/${eventSponsorId}/opt-in`,
    { method: 'POST' },
  );
  if (!response) return { ok: false, message: 'You need to be signed in.' };
  if (response.ok) return { ok: true };
  // Surface the backend's reason (e.g. "Register for this event…").
  let message = 'Could not share your details. Please try again.';
  try {
    const body = await response.json();
    if (body?.message) message = String(body.message);
  } catch {
    /* keep default */
  }
  return { ok: false, message };
}

/** Withdraw a previous opt-in. Best-effort; returns true when removed. */
export async function withdrawSponsorOptIn(
  eventId: string,
  eventSponsorId: string,
): Promise<boolean> {
  const response = await makeAuthenticatedRequest(
    `/events/${eventId}/sponsors/${eventSponsorId}/opt-in`,
    { method: 'DELETE' },
  );
  return Boolean(response?.ok);
}
