/**
 * Apex auth utilities (NestJS JWT)
 *
 * Apex authenticates against the Unifesto NestJS backend using a JWT.
 * The token is stored in a cookie (`unifesto_token`) so middleware can read
 * it server-side, and mirrored to localStorage for convenient client access.
 */

export const TOKEN_KEY = "unifesto_token";

/**
 * Cookie attributes that scope the token to `.unifesto.app`, so a sign-in here
 * is shared across every *.unifesto.app surface (apex, web, hack). Skipped on
 * localhost, where a parent-domain attribute would be rejected by the browser.
 */
function cookieScope(): string {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  const onUnifesto = host === "unifesto.app" || host.endsWith(".unifesto.app");
  const domain = onUnifesto ? "; Domain=.unifesto.app" : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  return `${domain}${secure}`;
}

/**
 * True when we're on a real `*.unifesto.app` host (not localhost). Only then is
 * a legacy *host-only* cookie possible, so only then must we purge it.
 */
function onUnifestoHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "unifesto.app" || host.endsWith(".unifesto.app");
}

/**
 * Expire the token cookie in EVERY scope it could have been written in.
 *
 * apex originally wrote `unifesto_token` *host-only* (no Domain). We now write
 * it `Domain=.unifesto.app` for cross-subdomain SSO — but per RFC 6265 those
 * are two DISTINCT cookies with the same name, and both are sent to
 * apex.unifesto.app. A clear that only expired the Domain-scoped one left the
 * stale host-only cookie alive, so `proxy.ts` (which checks cookie *presence*)
 * still saw a session and bounced /login -> / -> /login forever (the
 * no-access <-> loading loop). Deleting both scopes is the loop-breaker.
 */
function expireTokenCookieAllScopes() {
  if (typeof window === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // Host-only variant (the legacy apex cookie).
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax${secure}`;
  // Domain-scoped variant (the shared .unifesto.app SSO cookie).
  if (onUnifestoHost()) {
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax; Domain=.unifesto.app${secure}`;
  }
}

/**
 * Persist the JWT (client-side). Writes to both localStorage and a cookie.
 */
export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  // Purge any legacy host-only cookie first, so we never keep two same-named
  // `unifesto_token` cookies (host-only + Domain-scoped) alive at once — that
  // ambiguity is what let getAuthToken read a stale token and loop.
  expireTokenCookieAllScopes();
  // 30 day cookie, lax so it is sent on top-level navigations. Scoped to
  // `.unifesto.app` for cross-subdomain SSO (see cookieScope).
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${
    60 * 60 * 24 * 30
  }; SameSite=Lax${cookieScope()}`;
}

/**
 * Read the JWT (client-side). COOKIE FIRST, localStorage as fallback.
 *
 * The cookie is the shared `.unifesto.app` session — the single source of
 * truth across every *.unifesto.app app and the same thing `proxy.ts` reads
 * server-side. localStorage is a per-origin mirror; reading it first caused a
 * split-brain when another subdomain (hack) had signed in more recently — the
 * client would use a stale per-origin token while the proxy trusted the fresh
 * cookie, producing a 401 loop between /console and /no-access.
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  if (typeof document !== "undefined") {
    const cookie = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${TOKEN_KEY}=`));
    if (cookie) return cookie.substring(TOKEN_KEY.length + 1) || null;
  }

  try {
    const fromStorage = localStorage.getItem(TOKEN_KEY);
    if (fromStorage) return fromStorage;
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Authorization header value, or null when unauthenticated.
 */
export function getAuthHeader(): string | null {
  const token = getAuthToken();
  return token ? `Bearer ${token}` : null;
}

/**
 * Clear the stored JWT (logout).
 */
export function clearAuthToken() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  // Expire BOTH the Domain-scoped and the legacy host-only cookie — clearing
  // only one leaves the other alive and the middleware keeps seeing a session.
  expireTokenCookieAllScopes();
}
