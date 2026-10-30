/**
 * The console header's breadcrumb trail, from the URL: Dashboard › My Spaces ›
 * space › section › item › page. Pure, so it is tested without React
 * (crumbs.test.ts).
 */
export interface Crumb {
  href: string;
  label: string;
  /** A name (a space, an event) rather than a page label: the one kind that may be cut short. */
  name?: boolean;
}

export interface CrumbNames {
  /** The current space, which every space page sits under; null on personal pages or while loading. */
  space: string | null;
  /** A sidebar section by its path under /console, e.g. "events" or "settings/branding". */
  section: (path: string) => string | undefined;
  /** An event section by its first segment, e.g. "attendees". */
  eventSection: (segment: string) => string | undefined;
  /** A name a page published for its own path (an event's title). */
  named: (href: string) => string | undefined;
}

const BASE = "/console";

/** Personal pages (V9): not under a space. */
const PERSONAL: Record<string, string> = { tickets: "My tickets", account: "My account", feedback: "Feedback" };
const ACCOUNT: Record<string, string> = {
  inbox: "Inbox",
  support: "Support",
  saved: "Saved events",
  certificates: "My certificates",
  partner: "Partner stats",
  notifications: "Notifications",
  "sign-in": "Security",
  delete: "Delete account",
};
const WORDS: Record<string, string> = { new: "New", add: "Add", import: "Import", edit: "Edit", live: "Live", details: "My details" };
/** What an id stands for, by the segment before it. */
const ID_OF: Record<string, string> = { tickets: "Ticket", events: "Event", sessions: "Session", support: "Request", feedback: "Event" };

const looksLikeId = (s: string) => /\d/.test(s) && !(s in WORDS);
const titled = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

export function trail(pathname: string, names: CrumbNames): Crumb[] {
  const crumbs: Crumb[] = [{ href: BASE, label: "Dashboard" }];
  if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return crumbs;
  const segs = pathname.slice(BASE.length).split("/").filter(Boolean);
  if (!segs.length) return crumbs;

  // Space pages sit under My Spaces and the space; mine sit straight under Dashboard.
  if (!(segs[0] in PERSONAL)) {
    crumbs.push({ href: `${BASE}/spaces`, label: "My Spaces" });
    if (segs[0] === "spaces") return crumbs;
    if (names.space) crumbs.push({ href: `${BASE}/space`, label: names.space, name: true });
    if (segs[0] === "space") return crumbs;
  }

  let href = BASE;
  segs.forEach((seg, i) => {
    href += `/${seg}`;
    // My account is only the profile: Inbox, Sign-in and the rest under its URL aren't in it.
    if (i === 0 && seg === "account" && segs.length > 1) return;
    const parent = segs[i - 1];
    const named = names.named(href);
    const label =
      named ??
      (i === 0 ? PERSONAL[seg] : undefined) ??
      names.section(segs.slice(0, i + 1).join("/")) ??
      // The section right after an event's id: /console/events/<id>/attendees.
      (i === 2 && segs[0] === "events" ? names.eventSection(seg) : undefined) ??
      (segs[0] === "account" && i === 1 ? ACCOUNT[seg] : undefined) ??
      WORDS[seg] ??
      (looksLikeId(seg) ? ID_OF[parent] ?? "Details" : titled(seg));
    crumbs.push({ href, label, ...(named ? { name: true } : {}) });
  });
  return crumbs;
}
