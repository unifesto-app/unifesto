/**
 * Web sign-in session (K10). The public site only signs people in to register
 * for free events, so it keeps its own token in localStorage: no shared
 * `.unifesto.app` cookie (that one belongs to the operator apps and has bitten
 * us with cross-app loops), and nothing server-side reads it.
 * ponytail: no refresh-token rotation; an expired token just asks for the email code again.
 *
 * K14: the backend token lives 7 days, but the web keeps it at most 24 hours
 * (a stored session older than that, or from before this rule, is dropped), so
 * a token sitting in storage is only exposed for a day. The CSP is what stops
 * a script from reading it in the first place. A refresh token would be worse
 * here: it would put a 180-day credential in localStorage.
 */

const KEY = "unifesto_web_session";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface WebSession {
  token: string;
  email: string;
  fullName: string | null;
  /** When this browser signed in (ms). Set by setSession. */
  at?: number;
}

export function getSession(): WebSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as WebSession) : null;
    if (!s?.token) return null;
    if (!s.at || Date.now() - s.at > MAX_AGE_MS) {
      clearSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function setSession(s: WebSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, at: s.at ?? Date.now() }));
  } catch {
    // Storage blocked: the session lasts for this page only.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
