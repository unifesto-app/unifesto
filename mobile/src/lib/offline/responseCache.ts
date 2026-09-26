import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Last-known-good copies of GET responses, served when the network is gone.
 *
 * Two scopes: `user` (sent with the signed-in token — tickets, profile, my
 * spaces) is wiped on logout so the next person on the device never sees it;
 * `public` (events, spaces, config) survives logout.
 *
 * An index of { key → savedAt } is kept in memory + one AsyncStorage entry so
 * the oldest bodies can be evicted once we pass MAX_ENTRIES.
 */

export type CacheScope = 'user' | 'public';

const PREFIX = 'offline:v1:';
const INDEX_KEY = `${PREFIX}index`;
const MAX_ENTRIES = 250;
/** Skip bodies this large — a huge list isn't worth the storage for offline. */
const MAX_BODY_CHARS = 512_000;

type Index = Record<string, number>;
let index: Index | null = null;
let indexWrite: Promise<void> = Promise.resolve();

async function loadIndex(): Promise<Index> {
  if (index) return index;
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    index = raw ? JSON.parse(raw) : {};
  } catch {
    index = {};
  }
  return index!;
}

function persistIndex() {
  // Serialise writes so a slow earlier write can't clobber a newer index.
  indexWrite = indexWrite
    .then(() => AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index ?? {})))
    .catch(() => {});
}

const keyFor = (scope: CacheScope, path: string) => `${PREFIX}${scope}:${path}`;

/**
 * GET routes kept for offline use: what an attendee needs at the venue
 * (profile, tickets + their detail, saved things) and the browse surfaces they
 * last looked at. Everything else — payments, payouts, admin, operator lists
 * of other people's data — is never written to the device.
 */
const OFFLINE_ALLOWLIST: RegExp[] = [
  // Account
  /^\/users\/me$/,
  /^\/users\/me\/(registrations|member-tickets|waitlist|spaces)$/,
  /^\/registrations\/invites\/mine$/,
  /^\/certificates\/mine$/,
  /^\/favorites(\/ids)?$/,
  /^\/me\/sessions$/,
  // Ticket detail
  /^\/registrations\/[^/]+\/(checkins|group-members|whatsapp-group|seats)$/,
  // Browse
  /^\/categories$/,
  /^\/events$/,
  /^\/events\/[^/]+$/,
  /^\/events\/[^/]+\/(palette|my-registrations?)$/,
  /^\/events\/space\/[^/]+$/,
  /^\/spaces$/,
  /^\/spaces\/[^/]+(\/palette)?$/,
  /^\/spaces\/slug\/[^/]+$/,
  /^\/sessions(\/[^/]+)?$/,
  // Staff at the door: which events they can check in for
  /^\/checkin\/my-events$/,
];

export function shouldCache(path: string): boolean {
  const [route, query = ''] = path.split('?');
  if (!OFFLINE_ALLOWLIST.some((re) => re.test(route))) return false;
  // Searches and deep pages are one-offs; only the first page of a list is
  // what a screen shows on open.
  const params = new URLSearchParams(query);
  if (params.get('search')) return false;
  const page = params.get('page');
  return !page || page === '1';
}

export async function writeCache(scope: CacheScope, path: string, body: string): Promise<void> {
  if (body.length > MAX_BODY_CHARS || !shouldCache(path)) return;
  const key = keyFor(scope, path);
  try {
    await AsyncStorage.setItem(key, body);
    const idx = await loadIndex();
    idx[key] = Date.now();

    const keys = Object.keys(idx);
    if (keys.length > MAX_ENTRIES) {
      const stale = keys.sort((a, b) => idx[a] - idx[b]).slice(0, keys.length - MAX_ENTRIES);
      stale.forEach((k) => delete idx[k]);
      await AsyncStorage.multiRemove(stale);
    }
    persistIndex();
  } catch {
    // Storage full or unavailable: offline copies are best-effort.
  }
}

export async function readCache(
  scope: CacheScope,
  path: string,
): Promise<{ body: string; savedAt: number } | null> {
  const key = keyFor(scope, path);
  try {
    const body = await AsyncStorage.getItem(key);
    if (body == null) return null;
    const idx = await loadIndex();
    return { body, savedAt: idx[key] ?? 0 };
  } catch {
    return null;
  }
}

/** Drop everything tied to the signed-in account (call on logout). */
export async function clearUserCache(): Promise<void> {
  const idx = await loadIndex();
  const userKeys = Object.keys(idx).filter((k) => k.startsWith(`${PREFIX}user:`));
  userKeys.forEach((k) => delete idx[k]);
  persistIndex();
  try {
    await AsyncStorage.multiRemove(userKeys);
  } catch {}
}

/** Header set on responses rebuilt from the cache; value = savedAt (ms). */
export const OFFLINE_CACHE_HEADER = 'X-Unifesto-Offline-Cache';

export function cachedResponse(hit: { body: string; savedAt: number }): Response {
  return new Response(hit.body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', [OFFLINE_CACHE_HEADER]: String(hit.savedAt) },
  });
}
