/**
 * Web sign-in session (K10). The public site only signs people in to register
 * for free events, so it keeps its own token in localStorage: no shared
 * `.unifesto.app` cookie (that one belongs to the operator apps and has bitten
 * us with cross-app loops), and nothing server-side reads it.
 * ponytail: no refresh-token rotation; an expired token just asks for the email code again.
 */

const KEY = "unifesto_web_session";

export interface WebSession {
  token: string;
  email: string;
  fullName: string | null;
}

export function getSession(): WebSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as WebSession) : null;
    return s?.token ? s : null;
  } catch {
    return null;
  }
}

export function setSession(s: WebSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
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
