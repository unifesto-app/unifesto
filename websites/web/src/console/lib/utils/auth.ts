/**
 * The console's session (Track V8). One sign-in for everyone: web's /login and
 * its K18 session, whose access token lives in memory (src/lib/auth.ts) and is
 * renewed from an httpOnly refresh cookie. Nothing here writes a token.
 *
 * Transition: organisers signed in on the old space app hold a JS-readable
 * `unifesto_token` cookie on .unifesto.app. It is still read when there is no
 * web session, so they stay signed in until it expires (30 days at most).
 * V4 deletes this fallback.
 */
import { clearSession, getSession, refreshSession, sessionReady } from "@/lib/auth";

export const TOKEN_KEY = "unifesto_token";

/** The old space-app cookie, if any. Cookie only: on www nothing outlives it in localStorage. */
function legacyToken(): string | null {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${TOKEN_KEY}=`));
  return cookie?.substring(TOKEN_KEY.length + 1) || null;
}

/** Expire the old cookie in both scopes it can live in (host-only and .unifesto.app), and any copy in localStorage. */
export function clearLegacyToken() {
  if (typeof window === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax${secure}`;
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax; Domain=.unifesto.app${secure}`;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
}

/** The token for API calls right now: web's session first, else the old cookie. */
export function getAuthToken(): string | null {
  return getSession()?.token ?? legacyToken();
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

/** Sign out of both sessions. Await it before navigating away. */
export async function signOut(): Promise<void> {
  clearLegacyToken();
  await clearSession();
}
