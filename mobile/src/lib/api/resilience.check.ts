/**
 * Self-check for timeouts, retries and the no-wipe rule (no test runner in
 * this app). Run:
 *   npx tsc src/lib/api/resilience.check.ts --ignoreConfig --noCheck --outDir /tmp/apires --module commonjs --target es2022 --skipLibCheck && node /tmp/apires/resilience.check.js
 */
import { ApiError, TIMEOUT_MESSAGE, errorFrom } from './errors';
import {
  RequestTimeoutError,
  fetchWithTimeout,
  forgetGood,
  isTimeoutResponse,
  isTransient,
  recallGood,
  rememberGood,
  settle,
  withRetry,
  type SettleIO,
} from './resilience';

function check(ok: unknown, msg: string) {
  if (!ok) throw new Error(msg);
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const SAVED = '[{"id":"t1"}]';

/** IO double: one saved copy (or none), and a log of what settle reported. */
function io(saved: string | null) {
  const log = { saved: [] as string[], reached: [] as boolean[], unreached: 0 };
  const double: SettleIO = {
    save: (b) => log.saved.push(b),
    saved: async () => (saved == null ? null : new Response(saved, { status: 200, headers: { 'X-Saved': '1' } })),
    reached: (s) => log.reached.push(s),
    unreached: () => log.unreached++,
  };
  return { double, log };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function main() {
  // ── Timeout ────────────────────────────────────────────────────────────────
  const hang: typeof fetch = (_u, init) =>
    new Promise((_res, rej) => init!.signal!.addEventListener('abort', () => rej(new Error('aborted'))));
  const t = await fetchWithTimeout('x', {}, 20, hang).catch((e) => e);
  check(t instanceof RequestTimeoutError && t.message === TIMEOUT_MESSAGE, 'hung fetch → RequestTimeoutError');
  const boom: typeof fetch = async () => {
    throw new TypeError('Network request failed');
  };
  const n = await fetchWithTimeout('x', {}, 1_000, boom).catch((e) => e);
  check(n instanceof TypeError, 'a dropped connection is not reported as a timeout');

  // ── No wipe on transient GET failures ──────────────────────────────────────
  for (const status of [500, 502, 503, 504, 429, 408]) {
    const { double, log } = io(SAVED);
    const res = await settle('GET', async () => json(status, { message: 'down' }), double);
    check(res.ok && (await res.text()) === SAVED, `GET ${status} → last good copy`);
    check(log.reached[0] === true, `GET ${status} → banner says showing saved data`);
  }
  {
    const { double, log } = io(SAVED);
    const res = await settle('GET', async () => { throw new TypeError('offline'); }, double);
    check((await res.text()) === SAVED && log.unreached === 1, 'GET offline → last good copy, marked offline');
  }
  {
    const { double } = io(SAVED);
    const res = await settle('GET', () => Promise.reject(new RequestTimeoutError()), double);
    check((await res.text()) === SAVED, 'GET timeout → last good copy');
  }
  // Real answers are never covered up.
  for (const status of [400, 401, 403, 404]) {
    const { double } = io(SAVED);
    const res = await settle('GET', async () => json(status, {}), double);
    check(res.status === status, `GET ${status} passes through`);
  }
  // Nothing saved yet: the caller sees the real failure (its error state).
  {
    const { double } = io(null);
    const res = await settle('GET', async () => json(503, {}), double);
    check(res.status === 503, 'GET 503 with no copy → 503');
    const tr = await settle('GET', () => Promise.reject(new RequestTimeoutError()), double);
    check(tr.status === 408 && isTimeoutResponse(tr), 'GET timeout with no copy → typed 408');
    const e = await errorFrom(tr, 'fallback');
    check(e instanceof ApiError && e.timedOut && e.message === TIMEOUT_MESSAGE, 'timeout reads as ApiError.timedOut');
    const off = await settle('GET', () => Promise.reject(new TypeError('offline')), double).catch((x) => x);
    check(off instanceof TypeError, 'GET offline with no copy still throws (callers read null = offline)');
  }
  // A good GET is saved; the banner clears.
  {
    const { double, log } = io(null);
    await settle('GET', async () => json(200, [1]), double);
    await tick();
    check(log.saved[0] === '[1]' && log.reached[0] === false, 'GET 200 saved, no saved-data notice');
  }

  // ── Writes are never answered from a copy ──────────────────────────────────
  {
    const { double, log } = io(SAVED);
    const res = await settle('POST', async () => json(503, {}), double);
    await tick();
    check(res.status === 503 && log.saved.length === 0, 'POST 503 passes through, nothing saved');
    const tr = await settle('POST', () => Promise.reject(new RequestTimeoutError()), double);
    check(tr.status === 408, 'POST timeout → 408, not a saved copy');
    const off = await settle('POST', () => Promise.reject(new TypeError('offline')), double).catch((x) => x);
    check(off instanceof TypeError, 'POST offline throws');
  }

  // ── Retry only while unreached or transient ────────────────────────────────
  const noSleep = async () => {};
  {
    const seq = [null, json(503, {}), json(201, { ok: true })];
    let calls = 0;
    const res = await withRetry(async () => seq[calls++], [1, 1], noSleep);
    check(res?.status === 201 && calls === 3, 'retries null and 503 until it lands');
  }
  {
    let calls = 0;
    const res = await withRetry(async () => (calls++, json(409, {})), [1, 1], noSleep);
    check(res?.status === 409 && calls === 1, 'a 4xx verdict is not retried');
  }
  {
    let calls = 0;
    const res = await withRetry(async () => (calls++, null), [1, 1], noSleep);
    check(res === null && calls === 3, 'gives up after 3 tries, still null (offline)');
  }
  for (const s of [408, 429, 500, 503]) check(isTransient(s), `${s} transient`);
  for (const s of [200, 400, 401, 403, 404, 409]) check(!isTransient(s), `${s} not transient`);

  // ── In-memory last good copy ───────────────────────────────────────────────
  rememberGood('user:/a', 'A');
  check(recallGood('user:/a')?.body === 'A', 'recall');
  forgetGood();
  check(recallGood('user:/a') === null, 'forgotten on sign-out');
  for (let i = 0; i < 100; i++) rememberGood(`k${i}`, String(i));
  check(recallGood('k0') === null && recallGood('k99')?.body === '99', 'bounded: oldest evicted');

  console.log('resilience.check: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
