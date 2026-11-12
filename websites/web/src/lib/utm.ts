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
    // "localhost." is localhost; a name this long could hide its real domain in the button.
    const host = url.hostname.replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!host.includes(".") || host.length > 60 || PRIVATE_HOST.test(host)) return null;
    url.hash = "";
    return { href: url.toString(), host: host.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/** IP literals and names that only resolve inside someone's own network. */
const PRIVATE_HOST = /^\[|^[\d.]+$|\.(localhost|local|lan|internal|home|corp|intranet)$/i;

/** "/event/x" or "/event/x/register" → "x". */
const eventSlugOf = (path: string) => /^\/event\/([^/]+)/.exec(path)?.[1] ?? null;

/**
 * Whether the register page may send someone back to `returnHref` on its own,
 * after a short notice, instead of waiting for a click on "Back to <host>".
 * `referrerOrigin` is the origin of the page that sent them here, taken from
 * document.referrer on their first landing (null when the site sends none).
 *
 * The return link is attacker-controlled: anyone can craft
 * /event/x/register?return=https://evil.example and share it.
 */
export function autoReturnAllowed(referrerOrigin: string | null, returnHref: string): boolean {
  // Only back to the site that sent them here. A crafted link shared on
  // WhatsApp or another site arrives with no referrer or a different one, so
  // it gets the plain "Back to <host>" link and no "registered" marker.
  if (!referrerOrigin) return false;
  try {
    return new URL(returnHref).origin === referrerOrigin;
  } catch {
    return false;
  }
}

export interface StoredReturn {
  href: string;
  host: string;
  /** Came through embed.js: the site listens for "#unifesto=registered". */
  embed: boolean;
  /** Opened as embed.js's popup: the return hop may close the window. */
  popup: boolean;
  /**
   * The return page is on the site that sent them (autoReturnAllowed): only
   * then does the way back carry the "registered" marker, and only then do we
   * go back on our own, not only on a click.
   */
  auto: boolean;
}

/** The return link captured on landing on this event's pages, if any. */
export function storedReturn(slug: string): StoredReturn | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null") as {
      slug?: string;
      href?: string;
      embed?: boolean;
      popup?: boolean;
      ref?: string | null;
    } | null;
    const back = r?.slug === slug ? safeReturnUrl(r.href) : null;
    if (!back) return null;
    const embed = r!.embed === true;
    return { ...back, embed, popup: embed && r!.popup === true, auto: embed && autoReturnAllowed(r!.ref ?? null, back.href) };
  } catch {
    return null;
  }
}

/**
 * Where "Back to <host>" goes. For embed.js visitors from the return page's own
 * site who are now in (`registered`: confirmed or already in, not the waiting
 * list or a payment still confirming), it carries a fragment the script reads:
 * the event slug only, no ids, nothing personal. The site sees it as a hint,
 * never proof: anyone can type it. Webhooks are the proof.
 */
export function returnLink(r: StoredReturn, slug: string, registered: boolean): string {
  if (!r.auto || !registered) return r.href;
  return `${r.href}#unifesto=registered&event=${encodeURIComponent(slug)}${r.popup ? "&popup=1" : ""}`;
}

/** Origin of the page that sent this visitor, if the browser says. */
function referrerOrigin(): string | null {
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
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
    if (back && slug) {
      // The first landing says who sent them. A reload or a second landing on
      // the same link (the referrer is then often this page) keeps that answer.
      const prev = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null") as { slug?: string; href?: string; ref?: string | null } | null;
      const same = prev?.slug === slug && prev?.href === back.href;
      sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({
          slug,
          href: back.href,
          embed: q.get("embed") === "1",
          popup: q.get("popup") === "1",
          ref: same ? (prev?.ref ?? null) : referrerOrigin(),
        }),
      );
    }
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
