/**
 * UTM hand-off from the website into the app.
 *
 * Registration happens in the app, so a visitor who lands on a tagged event or
 * space link in the browser would lose the campaign the moment they tap "Open
 * in app". The landing tags are kept for the tab session (`captureUtm`, run
 * from the root layout) and re-appended to the app deep link (`withStoredUtm`),
 * where the app's link handler records them for attribution.
 *
 * C19: an email click lands with `nid` (the campaign it came from). It rides
 * the same way, kept apart so an untagged landing never drops it.
 */

const KEY = "unifesto.utm";
const RETURN_KEY = "unifesto.return";
const NID_KEY = "unifesto.nid";
const NID = /^[pie]:[\w.-]{1,64}$/;
const PARAMS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/**
 * An outside site's page to send people back to after registering
 * (`?return=` on a link the organiser put on their site). Attacker-controlled,
 * so: https only, no credentials, a real hostname, capped, and the fragment
 * dropped. Callers show the host and only ever link to it on a click.
 */
export function safeReturnUrl(raw: string | null | undefined): { href: string; host: string } | null {
  if (!raw || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!host.includes(".") || host.endsWith(".localhost")) return null;
    url.hash = "";
    return { href: url.toString(), host: host.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/** "/event/x" or "/event/x/register" → "x". */
const eventSlugOf = (path: string) => /^\/event\/([^/]+)/.exec(path)?.[1] ?? null;

/** The return link captured on landing on this event's pages, if any. */
export function storedReturn(slug: string): { href: string; host: string } | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null") as { slug?: string; href?: string } | null;
    return r?.slug === slug ? safeReturnUrl(r.href) : null;
  } catch {
    return null;
  }
}

/** Remember the utm_* tags on the current URL, if any. Latest tagged landing wins. */
export function captureUtm(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    // ?return= rides with the tags (sign-in drops the query string), kept for this event only.
    const back = safeReturnUrl(q.get("return"));
    const slug = eventSlugOf(window.location.pathname ?? "");
    if (back && slug) sessionStorage.setItem(RETURN_KEY, JSON.stringify({ slug, href: back.href }));
    const nid = q.get("nid");
    if (nid && NID.test(nid)) sessionStorage.setItem(NID_KEY, nid);
    if (!q.get("utm_source")) return;
    const tags: Record<string, string> = {};
    for (const k of PARAMS) {
      const v = q.get(k)?.trim().slice(0, 100);
      if (v) tags[k] = v;
    }
    sessionStorage.setItem(KEY, JSON.stringify(tags));
  } catch {
    // Storage blocked (private mode etc.): attribution is best-effort.
  }
}

function storedNid(): string | null {
  try {
    return sessionStorage.getItem(NID_KEY);
  } catch {
    return null;
  }
}

/** The remembered tags as the backend's registration attribution fields. */
export function storedUtm(): { utmSource?: string; utmMedium?: string; utmCampaign?: string; sourceNid?: string } {
  const nid = storedNid();
  let tags = {};
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) || "{}") as Record<string, string>;
    tags = { utmSource: t.utm_source, utmMedium: t.utm_medium, utmCampaign: t.utm_campaign };
  } catch {
    // Junk stored: no tags.
  }
  return nid ? { ...tags, sourceNid: nid } : tags;
}

/** Append the remembered tags to an app deep link (`unifesto://event/<slug>`). */
export function withStoredUtm(link: string): string {
  try {
    const tags = JSON.parse(sessionStorage.getItem(KEY) || "{}") as Record<string, string>;
    const nid = storedNid();
    const q = new URLSearchParams(nid ? { ...tags, nid } : tags).toString();
    return q ? `${link}${link.includes("?") ? "&" : "?"}${q}` : link;
  } catch {
    return link;
  }
}
