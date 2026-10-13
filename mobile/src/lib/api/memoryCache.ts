/**
 * Short-lived in-memory copies of GET responses so the app stops re-hitting
 * the API every time a screen mounts or regains focus.
 *
 * - A GET answered within its freshness window is served from memory, no network.
 * - Concurrent GETs for the same path share one request (Home fires ~10 at once,
 *   and several of them overlap with other tabs).
 * - Any successful write (POST/PATCH/PUT/DELETE) drops everything, so a screen
 *   never shows data from before the user's own change.
 * - Pull-to-refresh drops everything too (see components/ui/RefreshControl).
 *
 * This sits in front of the offline disk cache, which stays the network-failure
 * fallback only.
 */

import { OFFLINE_CACHE_HEADER } from '../offline/responseCache';

type Entry = { body: string; status: number; headers: [string, string][]; at: number };

const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Entry | null>>();
// Bumped on invalidate so a request that started before a write can't
// repopulate the cache with pre-write data when it lands.
let cacheGeneration = 0;

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * Never served from memory: screens that poll (WhatsApp inbox, check-in
 * rosters), money, live judging, threads, and anything a webhook or another
 * operator can change without this device writing.
 */
const NEVER: RegExp[] = [
  /^\/admin\//,
  /^\/checkin/,
  /^\/payouts/,
  /^\/refunds/,
  /^\/payments/,
  /^\/leaderboard/,
  // Hackathon teams, rooms and the in-app feed change with other curators'
  // edits and incoming pushes, not only this device's writes.
  /^\/hackathon\//,
  /^\/events\/[^/]+\/hackathon/,
  /^\/users\/me\/notifications/,
  /^\/support/,
  /^\/app\/version/,
  /^\/registrations\/claim\//,
];

/** The signed-in user's own things: short, mostly to stop tab-switch refetches. */
const PERSONAL = /(^\/users\/me|^\/me\/|\/my(-|\/|$)|\/mine$|^\/favorites|^\/registrations\/)/;

/** Reference data that changes a few times a year. */
const STATIC = /^\/(categories|config\/|subscription\/plans)/;

/** Public browse: events, spaces, sessions and their branding. */
const BROWSE = /^\/(events|spaces|sessions|white-label)(\/|$)/;

/** How long a GET for `path` may be served from memory, in ms. 0 = never cache. */
export function freshForMs(path: string): number {
  const route = path.split('?')[0];
  if (NEVER.some((re) => re.test(route))) return 0;
  // Checked before BROWSE: /events/:id/my-registrations is personal, not browse.
  if (PERSONAL.test(route)) return 20 * SECOND;
  if (STATIC.test(route)) return 10 * MINUTE;
  if (BROWSE.test(route)) return MINUTE;
  return 20 * SECOND;
}

const rebuild = (e: Entry) => new Response(e.body, { status: e.status, headers: e.headers });

export async function cachedGet(
  key: string,
  path: string,
  load: () => Promise<Response | null>,
): Promise<Response | null> {
  const ttl = freshForMs(path);
  const hit = entries.get(key);
  if (hit && ttl > 0 && Date.now() - hit.at < ttl) return rebuild(hit);

  let pending = inFlight.get(key);
  if (!pending) {
    const generation = cacheGeneration;
    const request: Promise<Entry | null> = (async () => {
      const res = await load();
      if (!res) return null;
      const entry: Entry = {
        body: await res.text(),
        status: res.status,
        headers: Array.from(res.headers.entries()),
        at: Date.now(),
      };
      // Only keep live, successful answers: not an offline-disk replay, and
      // not one that raced a write.
      const live = res.ok && !res.headers.has(OFFLINE_CACHE_HEADER);
      if (live && ttl > 0 && generation === cacheGeneration) entries.set(key, entry);
      return entry;
    })().finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
    inFlight.set(key, request);
    pending = request;
  }
  const entry = await pending;
  return entry ? rebuild(entry) : null;
}

/** Forget every cached GET (after a write, on pull-to-refresh, on logout). */
export function invalidateApiCache(): void {
  cacheGeneration++;
  entries.clear();
  inFlight.clear();
}
