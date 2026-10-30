/**
 * The console's session (Track V8). One sign-in for everyone: web's /login and
 * its K18 session, whose access token lives in memory (src/lib/auth.ts) and is
 * renewed from an httpOnly refresh cookie. Nothing here writes a token.
 */
import { clearSession, getSession, refreshSession, sessionReady } from "@/lib/auth";

/** The token for API calls right now: web's session, or null when signed out. */
export function getAuthToken(): string | null {
  return getSession()?.token ?? null;
}

/** getAuthToken, once this page has asked /auth/session. Use it before deciding someone is signed out. */
export async function currentToken(): Promise<string | null> {
  await sessionReady();
  return getAuthToken();
}

/** After a 401: a fresh access token from web's session, or null when there is none to renew. */
export async function renewToken(): Promise<string | null> {
  return (await refreshSession())?.token ?? null;
}

/** Web's one sign-in, coming back to this page (or `next`) after. */
export function loginHref(next?: string): string {
  const back = next ?? (typeof window === "undefined" ? "/console" : `${window.location.pathname}${window.location.search}`);
  return `/login?next=${encodeURIComponent(back)}`;
}

/** Sign out. Await it before navigating away. */
export async function signOut(): Promise<void> {
  await clearSession();
}
