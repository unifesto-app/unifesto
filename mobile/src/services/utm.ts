import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * UTM campaign tracking for event and space links.
 *
 * Outgoing: links the app shares are tagged (`withUtm`) so a curator can tell
 * attendee-to-attendee shares apart from their own Instagram / WhatsApp posts.
 *
 * Incoming: every system link passes through `+native-intent`, which hands it
 * to `captureUtmFromLink`. The last tagged event/space link opened on this
 * device is kept as a "touch" per event/space; at registration `attributionFor`
 * picks the one to credit, and the tags ride along with the order.
 */

export type Utm = { source: string; medium?: string; campaign?: string };

export type UtmTouch = Utm & {
  /** What the link pointed at, so attribution can check it matches. */
  target: { kind: 'event' | 'space'; slug: string };
  /** Epoch ms when the link was opened. */
  at: number;
};

const KEY = 'utm.touches';
const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Append utm_* params to a public link, keeping any existing query/hash. */
export function withUtm(url: string, utm: Utm): string {
  const [base, hash] = url.split('#');
  const params = [
    ['utm_source', utm.source],
    ['utm_medium', utm.medium],
    ['utm_campaign', utm.campaign],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
  const joined = params ? `${base}${base.includes('?') ? '&' : '?'}${params}` : base;
  return hash ? `${joined}#${hash}` : joined;
}

/** Read utm_* from any link form: https://…/event/x?utm_source=…, unifesto://event/x?…, /event/x?… */
function parseUtm(pathOrUrl: string): Utm | null {
  const q = pathOrUrl.split('#')[0].split('?')[1];
  if (!q) return null;
  const get = (k: string) => {
    const m = new RegExp(`(?:^|&)${k}=([^&]*)`).exec(q);
    if (!m) return undefined;
    try {
      return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim().slice(0, 100) || undefined;
    } catch {
      return undefined;
    }
  };
  const source = get('utm_source');
  return source ? { source, medium: get('utm_medium'), campaign: get('utm_campaign') } : null;
}

/** `event/<slug>` (also legacy `events/<slug>`) or `space/<slug>`, from any link form. */
function parseTarget(pathOrUrl: string): UtmTouch['target'] | null {
  const m = /(?:^|\/)(events?|space)\/([^/?#]+)/i.exec(pathOrUrl);
  if (!m) return null;
  return { kind: m[1].toLowerCase() === 'space' ? 'space' : 'event', slug: decodeURIComponent(m[2]) };
}

/** Most distinct events/spaces remembered at once; the oldest drop off first. */
const MAX_TOUCHES = 30;

async function readTouches(): Promise<UtmTouch[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((t): t is UtmTouch => !!t?.source && !!t?.target?.slug && typeof t.at === 'number');
  } catch {
    return [];
  }
}

const sameTarget = (a: UtmTouch['target'], b: UtmTouch['target']) =>
  a.kind === b.kind && a.slug === b.slug;

/**
 * Partner links (utm_medium=partner) are handed out by curators, often on a
 * per-registration deal, so they keep their credit: a later casual share never
 * displaces one. Only a newer partner link can.
 */
const isPartner = (t: Utm) => t.medium?.toLowerCase() === 'partner';

/**
 * Remember a tagged event/space link. One touch is kept per event/space (the
 * latest link for it wins, unless a partner link already holds it), so
 * opening a link for another event never wipes the credit a partner earned
 * for this one. Expired touches are pruned. Never throws.
 */
export async function captureUtmFromLink(pathOrUrl: string | null | undefined): Promise<void> {
  if (!pathOrUrl) return;
  const utm = parseUtm(pathOrUrl);
  const target = parseTarget(pathOrUrl);
  if (!utm || !target) return;
  const now = Date.now();
  const fresh = (await readTouches()).filter((t) => now - t.at <= ATTRIBUTION_WINDOW_MS);
  const held = fresh.find((t) => sameTarget(t.target, target));
  if (held && isPartner(held) && !isPartner(utm)) return;
  const touch: UtmTouch = { ...utm, target, at: now };
  const kept = fresh.filter((t) => !sameTarget(t.target, target));
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([touch, ...kept].slice(0, MAX_TOUCHES)));
  } catch {}
}

/**
 * Which remembered link, if any, gets credit for a registration on this event.
 *
 * Strict match within a 7-day window: only links that pointed at this event
 * (by slug or id) or at the space hosting it count. Priority: a partner link
 * (event or space) first, then an event link (the more specific signal), then
 * a space link; within a tier the most recently opened wins.
 */
export function pickAttribution(
  touches: UtmTouch[],
  event: { id?: string; slug?: string | null; spaceSlug?: string | null },
  now: number,
): Utm | null {
  const newest = (list: UtmTouch[]) => [...list].sort((a, b) => b.at - a.at)[0];
  const matching = touches.filter(
    (t) =>
      now - t.at <= ATTRIBUTION_WINDOW_MS &&
      ((t.target.kind === 'event' && (t.target.slug === event.slug || t.target.slug === event.id)) ||
        (t.target.kind === 'space' && !!event.spaceSlug && t.target.slug === event.spaceSlug)),
  );
  const best =
    newest(matching.filter(isPartner)) ??
    newest(matching.filter((t) => t.target.kind === 'event')) ??
    newest(matching);
  return best ? { source: best.source, medium: best.medium, campaign: best.campaign } : null;
}

/**
 * The tagged link that just opened this event/space page (within `maxAgeMs`),
 * if any. Used to credit a page view to the link that brought the visitor.
 */
export async function recentTouch(
  target: { kind: 'event' | 'space'; keys: (string | null | undefined)[] },
  maxAgeMs: number,
): Promise<Utm | null> {
  const now = Date.now();
  const hit = (await readTouches()).find(
    (t) => t.target.kind === target.kind && now - t.at <= maxAgeMs && target.keys.includes(t.target.slug),
  );
  return hit ? { source: hit.source, medium: hit.medium, campaign: hit.campaign } : null;
}

/** The utm fields to send with a registration for this event (empty when none apply). */
export async function attributionFor(event: {
  id?: string;
  slug?: string | null;
  spaceSlug?: string | null;
}): Promise<{ utmSource?: string; utmMedium?: string; utmCampaign?: string }> {
  const utm = pickAttribution(await readTouches(), event, Date.now());
  if (!utm) return {};
  return { utmSource: utm.source, utmMedium: utm.medium, utmCampaign: utm.campaign };
}
