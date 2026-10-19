/**
 * How API calls behave on bad venue Wi-Fi: request timeouts, which failures are
 * transient, retrying safe writes, and answering a GET from the last good copy
 * instead of wiping the screen. Pure (no React Native imports) so
 * `resilience.check.ts` can run it under plain node.
 */

import { TIMEOUT_MESSAGE } from './errors';

/** Until the response headers arrive. Long enough for 3G, short enough that a scan doesn't freeze. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** Multipart uploads (photos, CSVs) push the whole body first. */
export const UPLOAD_TIMEOUT_MS = 90_000;

/** Header on the 408 we answer with when a request timed out client-side. */
export const TIMEOUT_HEADER = 'X-Unifesto-Timeout';

export class RequestTimeoutError extends Error {
  constructor() {
    super(TIMEOUT_MESSAGE);
    this.name = 'RequestTimeoutError';
  }
}

/** `fetch` that aborts after `ms`, throwing RequestTimeoutError (other failures are rethrown as is). */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw timedOut ? new RequestTimeoutError() : error;
  } finally {
    clearTimeout(timer);
  }
}

/** A timeout as a response, so every caller's `!res.ok` path shows TIMEOUT_MESSAGE (status 408). */
export function timeoutResponse(): Response {
  return new Response(JSON.stringify({ message: TIMEOUT_MESSAGE }), {
    status: 408,
    headers: { 'Content-Type': 'application/json', [TIMEOUT_HEADER]: '1' },
  });
}

export const isTimeoutResponse = (res: Response | null | undefined) => !!res?.headers.has(TIMEOUT_HEADER);

/** Worth trying again later: the server was slow, busy or broken, not saying no. */
export function isTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Waits between attempts for retried writes (so 3 tries in all). */
export const RETRY_DELAYS_MS = [1_000, 3_000];

/**
 * Runs an idempotent write up to `delays.length + 1` times while it is
 * unreached (null) or transient. Only for writes the server upserts (scores,
 * statuses, lead scans): never money or approvals, where a repeat is a decision.
 */
export async function withRetry(
  run: () => Promise<Response | null>,
  delays: number[] = RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<Response | null> {
  for (let i = 0; ; i++) {
    const res = await run();
    if ((res && !isTransient(res.status)) || i >= delays.length) return res;
    await sleep(delays[i]);
  }
}

// ── Last good copy, in memory ────────────────────────────────────────────────
// Every GET path, not just the disk allowlist: operator screens (queues, judging,
// refunds, inbox) keep what they showed through a blip, without their data ever
// touching the device's storage. Cleared on sign-out.

const MAX_GOOD = 80;
const MAX_GOOD_CHARS = 512_000;
const good = new Map<string, { body: string; at: number }>();

export function rememberGood(key: string, body: string): void {
  if (body.length > MAX_GOOD_CHARS) return;
  good.delete(key); // re-insert so Map order stays least-recently-saved first
  good.set(key, { body, at: Date.now() });
  if (good.size > MAX_GOOD) good.delete(good.keys().next().value!);
}

export function recallGood(key: string): { body: string; savedAt: number } | null {
  const hit = good.get(key);
  return hit ? { body: hit.body, savedAt: hit.at } : null;
}

export function forgetGood(): void {
  good.clear();
}

// ── One request, settled ─────────────────────────────────────────────────────

export interface SettleIO {
  /** A live, OK GET body: keep it as the last good copy. */
  save(body: string): void;
  /** The last good copy as a response marked as saved, or null. */
  saved(): Promise<Response | null>;
  /** The server answered; `servedSaved` = we showed a saved copy over its error. */
  reached(servedSaved: boolean): void;
  /** No answer: dropped connection or timeout. */
  unreached(): void;
}

/**
 * The no-wipe rule. A GET that fails for a transient reason (no network,
 * timeout, 408/429/5xx) is answered from the last good copy, so lists never
 * turn into "nothing here" on a blip. Writes are never replayed from a copy; a
 * timed-out request of either kind becomes a 408 with TIMEOUT_MESSAGE, and a
 * dropped connection still throws (callers read that as offline).
 */
export async function settle(method: string, run: () => Promise<Response>, io: SettleIO): Promise<Response> {
  let res: Response;
  try {
    res = await run();
  } catch (error) {
    io.unreached();
    const copy = method === 'GET' ? await io.saved() : null;
    if (copy) return copy;
    if (error instanceof RequestTimeoutError) return timeoutResponse();
    throw error;
  }
  if (method === 'GET' && res.ok) {
    res.clone().text().then((body) => io.save(body), () => {});
  } else if (method === 'GET' && isTransient(res.status)) {
    const copy = await io.saved();
    io.reached(!!copy);
    return copy ?? res;
  }
  io.reached(false);
  return res;
}
