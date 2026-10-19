import * as SecureStore from 'expo-secure-store';
import { API_URL as BASE_URL } from '../constants';
import { reportNetworkFailure, reportNetworkSuccess } from '../offline/connectivity';
import {
  cachedResponse,
  clearUserCache,
  readCache,
  writeCache,
  type CacheScope,
} from '../offline/responseCache';
import { clearCheckinRosters } from '../offline/checkinStorage';
import { cachedGet, invalidateApiCache } from './memoryCache';
import { readJson, refreshEndsSession } from './errors';
import {
  REQUEST_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  fetchWithTimeout,
  forgetGood,
  recallGood,
  rememberGood,
  settle,
  withRetry,
} from './resilience';

export { ApiError, errorFrom, expectOk, readJson } from './errors';

/**
 * `retry`: try again (twice, with backoff) when unreached or transient. Only
 * for writes the server upserts: scores, statuses, lead scans. Never money or
 * approvals, which fail once with a clear message instead.
 */
export type ApiRequestInit = RequestInit & { retry?: boolean };

/**
 * Tokens are readable after the first unlock since boot, not only while the
 * phone is unlocked: widget refreshes, background fetch and reloads with the
 * phone locked otherwise fail with "User interaction is not allowed" and every
 * request goes out signed-out. The Keychain can't change an existing item's
 * accessibility, so the tokens moved to new keys; `readToken` carries the old
 * one over on first read.
 */
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const TOKEN_KEY = 'unifesto_access_token_v2';
const REFRESH_KEY = 'unifesto_refresh_token_v2';
const LEGACY_KEYS: Record<string, string> = {
  [TOKEN_KEY]: 'unifesto_access_token',
  [REFRESH_KEY]: 'unifesto_refresh_token',
};

async function readToken(key: string): Promise<string | null> {
  const value = await SecureStore.getItemAsync(key, KEYCHAIN);
  if (value) return value;
  const legacy = await SecureStore.getItemAsync(LEGACY_KEYS[key]);
  if (!legacy) return null;
  await SecureStore.setItemAsync(key, legacy, KEYCHAIN);
  await SecureStore.deleteItemAsync(LEGACY_KEYS[key]);
  return legacy;
}

export async function getToken(): Promise<string | null> {
  try {
    return await readToken(TOKEN_KEY);
  } catch (error) {
    if (__DEV__) console.warn('[api] Failed to read auth token from SecureStore:', error);
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await readToken(REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, KEYCHAIN);
}

/** Persist the access token and (when present) the refresh token together. */
export async function saveTokens(
  accessToken: string,
  refreshToken?: string | null
): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken, KEYCHAIN);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken, KEYCHAIN);
}

export async function clearToken(): Promise<void> {
  await Promise.all(
    [TOKEN_KEY, REFRESH_KEY, ...Object.values(LEGACY_KEYS)].map((k) => SecureStore.deleteItemAsync(k)),
  );
  invalidateApiCache();
  forgetGood();
  // Signed out (explicitly or by a dead refresh): the account's offline copies
  // go too, including saved guest lists (attendee names). Unsynced check-ins
  // are kept, keyed by user, so they upload on that account's next sign-in.
  await Promise.all([clearUserCache(), clearCheckinRosters()]);
}

/**
 * Runs a request with a timeout and keeps connectivity + the saved copies in
 * step with it (see `settle`): a good GET is saved, in memory for any path and
 * on disk for the offline allowlist; a GET that fails for a transient reason is
 * answered from that copy (marked with OFFLINE_CACHE_HEADER) instead of wiping
 * the screen. Non-GETs are never replayed from a copy.
 */
function withOfflineCache(
  scope: CacheScope,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const method = init.method ?? 'GET';
  const key = `${scope}:${path}`;
  const timeout = init.body instanceof FormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  return settle(method, () => fetchWithTimeout(`${BASE_URL}${path}`, init, timeout), {
    save: (body) => {
      rememberGood(key, body);
      void writeCache(scope, path, body);
    },
    saved: async () => {
      const hit = recallGood(key) ?? (await readCache(scope, path));
      return hit ? cachedResponse(hit) : null;
    },
    reached: reportNetworkSuccess,
    unreached: reportNetworkFailure,
  });
}

/**
 * Session events for AuthContext: a forced sign-out (the server refused the
 * refresh token) must reset the signed-in UI, not just wipe the Keychain.
 */
type SessionListener = () => void;
const sessionEndedListeners = new Set<SessionListener>();

export function onSessionEnded(listener: SessionListener): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

async function endSession(): Promise<void> {
  await clearToken();
  sessionEndedListeners.forEach((l) => l());
}

/** A new access token, 'ended' when the server refused the refresh, or null when it couldn't say (offline, 5xx, 429). */
type RefreshResult = string | 'ended' | null;

// Single-flight refresh: if several requests 401 at once, they all await the
// same /auth/refresh call instead of each firing their own.
let refreshInFlight: Promise<RefreshResult> | null = null;

async function refreshSession(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async (): Promise<RefreshResult> => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return 'ended';
      const res = await fetchWithTimeout(
        `${BASE_URL}/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        },
        REQUEST_TIMEOUT_MS,
      );
      if (!res.ok) return refreshEndsSession(res.status) ? 'ended' : null;
      const data = await readJson<{ accessToken?: string; refreshToken?: string }>(res);
      if (!data?.accessToken) return null;
      await saveTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      // Couldn't reach the server — not a verdict on the session.
      reportNetworkFailure();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Fresh access token, or null (session kept unless the server refused the refresh token). */
export async function refreshAccessToken(): Promise<string | null> {
  const result = await refreshSession();
  if (result === 'ended') {
    await endSession();
    return null;
  }
  return result;
}

export async function makeAuthenticatedRequest(
  path: string,
  { retry, ...options }: ApiRequestInit = {}
): Promise<Response | null> {
  const method = options.method ?? 'GET';
  if (method === 'GET') {
    return cachedGet(`user:${path}`, path, () => sendAuthenticatedRequest(path, options, method));
  }
  const send = () => sendAuthenticatedRequest(path, options, method);
  const response = await (retry ? withRetry(send) : send());
  if (response?.ok) invalidateApiCache();
  return response;
}

async function sendAuthenticatedRequest(
  path: string,
  options: RequestInit,
  method: string,
): Promise<Response | null> {
  const token = await getToken();
  if (!token) {
    if (__DEV__) console.warn(`[api] ${method} ${path} skipped: no auth token available.`);
    return null;
  }

  const doFetch = (t: string) =>
    withOfflineCache('user', path, {
      ...options,
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

  try {
    let response = await doFetch(token);

    // Access token expired → silently refresh once, then retry. Only a refresh
    // the server refused ends the session (refreshAccessToken); a 5xx, 429 or
    // dropped connection keeps it and this request just fails with its 401.
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) response = await doFetch(newToken);
    }

    return response;
  } catch (error) {
    // Network/fetch failure. Return null to preserve the caller contract,
    // but log so the failure is observable instead of silently swallowed.
    if (__DEV__) console.error(`[api] ${method} ${path} request failed:`, error);
    return null;
  }
}

/**
 * Bearer header when signed in, else nothing. For public endpoints whose
 * response widens for insiders (drafts for operators, private spaces for
 * members). The backend ignores a bad/expired token on these routes, so no
 * refresh/401 handling is needed here.
 */
export async function optionalAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** `makePublicRequest` that also sends the stored token when there is one. */
export async function makeOptionalAuthRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response | null> {
  return makePublicRequest(path, {
    ...options,
    headers: { ...(await optionalAuthHeaders()), ...options.headers },
  });
}

export async function makePublicRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response | null> {
  const method = options.method ?? 'GET';

  // Sent with a token → the body can be account-specific (drafts, private
  // spaces), so it belongs to the user scope and is wiped on logout.
  const headers = (options.headers ?? {}) as Record<string, string>;
  const scope: CacheScope = headers.Authorization ? 'user' : 'public';

  if (method === 'GET') {
    return cachedGet(`${scope}:${path}`, path, () => sendPublicRequest(path, options, method, scope));
  }
  const response = await sendPublicRequest(path, options, method, scope);
  if (response?.ok) invalidateApiCache();
  return response;
}

async function sendPublicRequest(
  path: string,
  options: RequestInit,
  method: string,
  scope: CacheScope,
): Promise<Response | null> {
  try {
    return await withOfflineCache(scope, path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    // Network/fetch failure. Return null to preserve the caller contract,
    // but log so the failure is observable instead of silently swallowed.
    if (__DEV__) console.error(`[api] ${method} ${path} request failed:`, error);
    return null;
  }
}
