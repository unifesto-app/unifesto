/**
 * UTM hand-off from the website into the app.
 *
 * Registration happens in the app, so a visitor who lands on a tagged event or
 * space link in the browser would lose the campaign the moment they tap "Open
 * in app". The landing tags are kept for the tab session (`captureUtm`, run
 * from the root layout) and re-appended to the app deep link (`withStoredUtm`),
 * where the app's link handler records them for attribution.
 */

const KEY = "unifesto.utm";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/** Remember the utm_* tags on the current URL, if any. Latest tagged landing wins. */
export function captureUtm(): void {
  try {
    const q = new URLSearchParams(window.location.search);
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

/** The remembered tags as the backend's registration attribution fields. */
export function storedUtm(): { utmSource?: string; utmMedium?: string; utmCampaign?: string } {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) || "{}") as Record<string, string>;
    return { utmSource: t.utm_source, utmMedium: t.utm_medium, utmCampaign: t.utm_campaign };
  } catch {
    return {};
  }
}

/** Append the remembered tags to an app deep link (`unifesto://event/<slug>`). */
export function withStoredUtm(link: string): string {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return link;
    const q = new URLSearchParams(JSON.parse(raw) as Record<string, string>).toString();
    return q ? `${link}${link.includes("?") ? "&" : "?"}${q}` : link;
  } catch {
    return link;
  }
}
