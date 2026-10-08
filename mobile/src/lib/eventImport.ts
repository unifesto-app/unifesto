import type { EventDraft } from './eventDraft';
import { INDIAN_STATES } from './indianStates';

/**
 * Prefill the create form from an event page elsewhere. Runs on the device
 * (React Native fetch has no CORS), so nothing new on the backend.
 *
 * Luma, Meetup and most event sites publish schema.org `Event` JSON-LD for
 * search engines, which is the generic path; Open Graph tags are the last
 * resort. Unstop and Devnovate are client-rendered, so they're read from the
 * public JSON their own pages load.
 */

export type ImportSource = 'Luma' | 'Meetup' | 'Unstop' | 'Devnovate' | 'Website';

/** Shown on the import card, in this order. */
export const IMPORT_SOURCES: ImportSource[] = ['Luma', 'Meetup', 'Unstop', 'Devnovate', 'Website'];

export interface ImportedEvent {
  source: ImportSource;
  url: string;
  /** Only what the page actually had; everything else keeps the form's default. */
  patch: Partial<EventDraft>;
  /** Remote poster/banner; the user frames it at 4:3 before it becomes the cover. */
  imageUrl: string | null;
}

export function sourceOf(host: string): ImportSource {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (h === 'lu.ma' || h === 'luma.com' || h.endsWith('.luma.com')) return 'Luma';
  if (h === 'meetup.com' || h.endsWith('.meetup.com')) return 'Meetup';
  if (h === 'unstop.com' || h.endsWith('.unstop.com')) return 'Unstop';
  if (h === 'devnovate.co' || h.endsWith('.devnovate.co')) return 'Devnovate';
  return 'Website';
}

/** "lu.ma/abc" → "https://lu.ma/abc"; null when it isn't a web address at all. */
export function normalizeUrl(raw: string): URL | null {
  const t = raw.trim().split(/\s+/).find((w) => /\w\.\w/.test(w)) ?? '';
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.includes('.') ? u : null;
  } catch {
    return null;
  }
}

// ── Text helpers ─────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', hellip: '…' };

export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Rich HTML (Unstop's details) → readable plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Match a region to the State picker's list; anything else is left blank. */
const toState = (region?: string | null) => {
  const r = (region ?? '').trim().toLowerCase();
  return INDIAN_STATES.find((s) => s.toLowerCase() === r) ?? '';
};

const validDate = (v: unknown) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "2026-10-13" (no time) means that day, so read it as local 10:00 rather than UTC midnight. */
const dayOrDate = (v: unknown, hour: number) => {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d, hour);
  }
  return validDate(v);
};

/** Start and end only if the start is real; a missing or backwards end becomes start + 2h. */
function when(start: Date | null, end: Date | null): Partial<EventDraft> {
  if (!start) return {};
  return { start, end: end && end > start ? end : new Date(start.getTime() + 2 * 3600_000) };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);

/** Drop empty strings so a patch never blanks a field the page didn't have. */
function compact(p: Partial<EventDraft>): Partial<EventDraft> {
  const out: Partial<EventDraft> = {};
  for (const [k, v] of Object.entries(p) as [keyof EventDraft, unknown][]) {
    if (v === '' || v === undefined || v === null) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// ── schema.org JSON-LD (Luma, Meetup, Eventbrite, most sites) ────────────────

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Every object in the page's JSON-LD blocks whose @type ends in "Event" (nested ones included). */
export function findJsonLdEvents(html: string): any[] {
  const found: any[] = [];
  const isEvent = (o: any) => asArray(o?.['@type']).some((t) => typeof t === 'string' && /Event$/.test(t));
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (isEvent(o)) found.push(o);
    else for (const v of Object.values(o)) walk(v);
  };
  for (const [, body] of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(body.trim()));
    } catch {
      // A malformed block elsewhere on the page shouldn't stop the others.
    }
  }
  return found;
}

const imageUrlOf = (img: any): string | null => {
  const urls = asArray(img)
    .map((i) => (typeof i === 'string' ? i : i?.url ?? i?.contentUrl))
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u));
  // Meetup lists the same photo at several sizes; take the 4:3 one when it's there.
  return urls.find((u) => /\b676x507\b/.test(u)) ?? urls[0] ?? null;
};

export function fromJsonLd(ev: any): { patch: Partial<EventDraft>; imageUrl: string | null } {
  const mode = String(ev.eventAttendanceMode ?? '');
  const locations = asArray(ev.location);
  const place = locations.find((l: any) => l?.['@type'] !== 'VirtualLocation' && (l?.address || l?.name));
  const virtual = locations.some((l: any) => l?.['@type'] === 'VirtualLocation');
  const type: EventDraft['type'] = /Mixed/i.test(mode) ? 'HYBRID' : /Online/i.test(mode) || (virtual && !place) ? 'ONLINE' : 'IN_PERSON';

  const addr = typeof place?.address === 'string' ? { streetAddress: place.address } : place?.address ?? {};
  const geo = place?.geo ?? place;
  const lat = Number(geo?.latitude);
  const lng = Number(geo?.longitude);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && geo?.latitude != null;

  // Only an INR price maps onto our ticket; a dollar figure would be wrong in ₹.
  const prices = asArray(ev.offers)
    .filter((o: any) => !o?.priceCurrency || /^INR$/i.test(o.priceCurrency))
    .map((o: any) => Number(o?.price ?? o?.lowPrice))
    .filter((n) => Number.isFinite(n) && n > 0);

  const keywords = Array.isArray(ev.keywords) ? ev.keywords.join(', ') : typeof ev.keywords === 'string' ? ev.keywords : '';
  const venueName = typeof place?.name === 'string' ? decodeEntities(place.name) : '';
  const street = typeof addr.streetAddress === 'string' ? decodeEntities(addr.streetAddress) : '';

  return {
    patch: compact({
      title: clip(decodeEntities(String(ev.name ?? '')).trim(), 150),
      description: htmlToText(String(ev.description ?? '')),
      tags: keywords,
      type,
      ...when(validDate(ev.startDate), validDate(ev.endDate)),
      venueName,
      // Luma repeats the venue name as the street; don't show it twice.
      venueAddress: street && street !== venueName ? street : '',
      city: typeof addr.addressLocality === 'string' ? addr.addressLocality : '',
      state: toState(addr.addressRegion),
      latitude: hasPin ? lat : null,
      longitude: hasPin ? lng : null,
      ...(prices.length
        ? { registrationType: 'TICKETED' as const, ticketName: 'General admission', ticketPrice: String(Math.min(...prices)) }
        : {}),
    }),
    imageUrl: imageUrlOf(ev.image),
  };
}

// ── Open Graph fallback (any page) ───────────────────────────────────────────

export function metaTag(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() !== key) continue;
    const content = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decodeEntities(content).trim();
  }
  return '';
}

export function fromMeta(html: string): { patch: Partial<EventDraft>; imageUrl: string | null } {
  const rawTitle = metaTag(html, 'og:title') || decodeEntities(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').trim();
  const image = metaTag(html, 'og:image') || metaTag(html, 'twitter:image');
  return {
    // "Name · Luma", "Name | Site": drop the site suffix.
    patch: compact({
      title: clip(rawTitle.replace(/\s+[|·•–-]\s+[^|·•–-]+$/, '').trim(), 150),
      description: metaTag(html, 'og:description') || metaTag(html, 'description'),
    }),
    imageUrl: /^https?:\/\//.test(image) ? image : null,
  };
}

// ── Unstop (client-rendered; public competition JSON) ────────────────────────

/** ".../hackathons/some-name-1369976" → "1369976" */
export const unstopId = (u: URL) => /(\d{4,})\/?$/.exec(u.pathname)?.[1] ?? null;

export function fromUnstop(o: any): { patch: Partial<EventDraft>; imageUrl: string | null } {
  const where = o.address_with_country_logo ?? {};
  const online = /online/i.test(String(o.region ?? ''));
  return {
    patch: compact({
      title: clip(String(o.title ?? '').trim(), 150),
      description: htmlToText(String(o.details ?? '')),
      tags: [o.type, o.subtype].filter((t) => typeof t === 'string' && t).join(', '),
      type: online ? 'ONLINE' : 'IN_PERSON',
      ...when(validDate(o.start_date), validDate(o.end_date)),
      venueName: online ? '' : String(o.festival?.organisation?.name ?? o.organisation?.name ?? ''),
      venueAddress: online ? '' : String(where.address ?? ''),
      city: online ? '' : String(where.city ?? ''),
      state: online ? '' : toState(where.state),
    }),
    imageUrl: o.banner_mobile?.image_url ?? o.banner?.image_url ?? o.logoUrl2 ?? null,
  };
}

// ── Devnovate (client-rendered; public event JSON) ───────────────────────────

/** "/event/respawn" → "respawn" */
export const devnovateName = (u: URL) => /\/event\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null;

export function fromDevnovate(o: any): { patch: Partial<EventDraft>; imageUrl: string | null } {
  const status = String(o.status ?? '').toUpperCase();
  const type: EventDraft['type'] = status === 'HYBRID' ? 'HYBRID' : status === 'ONLINE' ? 'ONLINE' : 'IN_PERSON';
  const price = Number(o.price);
  return {
    patch: compact({
      title: clip(String(o.name ?? '').trim(), 150),
      description: String(o.subtitle ?? o.description ?? '').trim(),
      tags: asArray(o.theme).map((t) => String(t).trim()).filter(Boolean).join(', '),
      type,
      ...when(dayOrDate(o.startDate, 10), dayOrDate(o.endDate, 18)),
      venueName: type === 'ONLINE' ? '' : String(o.organizationName ?? '').trim(),
      venueAddress: type === 'ONLINE' ? '' : String(o.location ?? '').trim(),
      ...(o.paid && price > 0 ? { registrationType: 'TICKETED' as const, ticketName: 'General admission', ticketPrice: String(price) } : {}),
    }),
    imageUrl: o.bannerImage || o.mobileBannerImage || o.cardImage || null,
  };
}

// ── Fetch ────────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function get(url: string, accept: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { Accept: accept, 'User-Agent': UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(res.status === 404 ? "That page doesn't exist anymore." : `The page answered with an error (${res.status}).`);
    return res;
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('The page took too long to load.');
    if (e instanceof TypeError) throw new Error("Couldn't reach that page. Check the link and your connection.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Throws an Error with a message fit to show as-is. */
export async function importEvent(raw: string): Promise<ImportedEvent> {
  const u = normalizeUrl(raw);
  if (!u) throw new Error("That doesn't look like a link.");
  const source = sourceOf(u.hostname);
  let parsed: { patch: Partial<EventDraft>; imageUrl: string | null } | null = null;

  if (source === 'Unstop' && unstopId(u)) {
    const res = await get(`https://unstop.com/api/public/competition/${unstopId(u)}`, 'application/json');
    const o = (await res.json())?.data?.competition;
    if (o) parsed = fromUnstop(o);
  } else if (source === 'Devnovate' && devnovateName(u)) {
    const res = await get(`https://devnovate.co/api/v1/events/name/${encodeURIComponent(devnovateName(u)!)}`, 'application/json');
    const o = (await res.json())?.hackathon;
    if (o) parsed = fromDevnovate(o);
  } else {
    const html = await (await get(u.toString(), 'text/html')).text();
    const events = findJsonLdEvents(html);
    // A listing ("events in Bengaluru") carries many; guessing one would import the wrong event.
    if (events.length > 1) throw new Error("That's a list of events. Open the one to import and share its link.");
    const ev = events[0];
    const meta = fromMeta(html);
    // JSON-LD wins field by field; Open Graph fills what it left out (often the cover).
    parsed = ev ? fromJsonLd(ev) : meta;
    if (ev) parsed = { patch: { ...meta.patch, ...parsed.patch }, imageUrl: parsed.imageUrl ?? meta.imageUrl };
  }

  if (!parsed?.patch.title) throw new Error("Couldn't find an event on that page. Try the event's own page, not a list.");
  return { source, url: u.toString(), ...parsed };
}
