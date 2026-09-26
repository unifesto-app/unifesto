/**
 * Public lead capture (P4) — "Notify me" on an event and the inquiry form on a
 * space page. Unauthenticated, so we call the backend directly with fetch (the
 * same pattern as the public spaces/events reads), not the Supabase-auth client.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface LeadCapture {
  name?: string;
  email: string;
  phone?: string;
  message?: string;
}

async function post(path: string, body: LeadCapture): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    let error = "Something went wrong. Please try again.";
    try {
      const data = await res.json();
      if (data?.message) error = Array.isArray(data.message) ? data.message[0] : String(data.message);
    } catch {
      /* keep default */
    }
    return { ok: false, error };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

/** Register interest in an event ("Notify me"). */
export function registerEventInterest(eventId: string, body: LeadCapture) {
  return post(`/events/${eventId}/interest`, body);
}

/** Submit an inquiry to a space. */
export function submitSpaceInquiry(spaceId: string, body: LeadCapture) {
  return post(`/spaces/${spaceId}/inquiry`, body);
}
