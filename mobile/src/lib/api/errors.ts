/**
 * The one error convention for API calls. Pure (no React Native imports) so
 * `errors.check.ts` can run it under plain node.
 */

/** A failed API call. `status` is the HTTP status, or 0 when the server couldn't be reached. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }

  get offline(): boolean {
    return this.status === 0;
  }

  /** No answer in time (our client-side timeout, or the server's 408). */
  get timedOut(): boolean {
    return this.status === 408;
  }
}

export const OFFLINE_MESSAGE = "Can't reach Unifesto. Check your connection and try again.";
export const TIMEOUT_MESSAGE = 'Unifesto is taking too long to answer. Check your connection and try again.';

/** Body as JSON, or null when it is empty or not JSON (proxies answer 502s in HTML). */
export async function readJson<T = any>(response: Pick<Response, 'text'>): Promise<T | null> {
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** The ApiError for a failed (or never-sent: null) response, using the server's message when it sent one. */
export async function errorFrom(
  response: Pick<Response, 'status' | 'text'> | null | undefined,
  fallback: string,
): Promise<ApiError> {
  if (!response) return new ApiError(OFFLINE_MESSAGE, 0);
  const body = await readJson<{ message?: unknown }>(response);
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return new ApiError(typeof message === 'string' && message ? message : fallback, response.status);
}

/** Parsed body of an OK response; throws ApiError otherwise. */
export async function expectOk<T = any>(
  response: Pick<Response, 'ok' | 'status' | 'text'> | null | undefined,
  fallback: string,
): Promise<T> {
  if (!response?.ok) throw await errorFrom(response, fallback);
  return (await readJson<T>(response)) as T;
}

/**
 * Whether a failed /auth/refresh means the session is over. Only the server
 * refusing the refresh token (bad, expired, revoked, reused) is; a 5xx, 429 or
 * dropped connection says nothing about the session, so it is kept and the
 * next request tries again.
 */
export function refreshEndsSession(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}
