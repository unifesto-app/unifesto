import { makePublicRequest } from './helpers';

/**
 * Public lead capture (P4) — "Notify me" on an event. Unauthenticated: an
 * attendee registers interest before (or instead of) buying a ticket, and it
 * lands in the organiser's lead funnel.
 */
export async function registerEventInterest(
  eventId: string,
  body: { name?: string; email: string; phone?: string; message?: string },
): Promise<{ ok: boolean; message?: string }> {
  const response = await makePublicRequest(`/events/${eventId}/interest`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (response?.ok) return { ok: true };
  let message = 'Could not register your interest. Please try again.';
  try {
    if (response) {
      const data = await response.json();
      if (data?.message) {
        message = Array.isArray(data.message) ? data.message[0] : String(data.message);
      }
    }
  } catch {
    /* keep default */
  }
  return { ok: false, message };
}
