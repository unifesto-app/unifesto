/**
 * Grievances (D25), from the public /grievance page. No sign-in: the email
 * sign-in code proves the address, then the grievance opens a case for that
 * account on Unifesto's desk.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function post<T>(path: string, body: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    const msg = data?.message;
    return { ok: false, error: (Array.isArray(msg) ? msg[0] : msg) || "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

/** Email a one-time code to the address (the same code as signing in). */
export function sendGrievanceCode(email: string) {
  return post<{ message: string }>("/auth/email", { email });
}

/** Open the grievance. Resolves with its case number. */
export function submitGrievance(body: { email: string; otp: string; subject: string; message: string }) {
  return post<{ ticketNumber: number }>("/support/grievances", body);
}
