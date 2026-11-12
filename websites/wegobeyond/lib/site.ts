// Brand facts stay in code here. Everything editable (hero line, inboxes, socials,
// initiatives, gallery, crew, press, the crew form) comes from Unifesto: edited in
// Unifesto Apex (apex.unifesto.app/wegobeyond), read with getContent(). Events come
// live from Unifesto too (lib/events.ts). Nothing editable lives in this repo.
import type { Metadata } from "next";
import type { CrewFormDef } from "@/lib/crewForm";
import type { Initiative } from "@/lib/initiatives";

// Canonical production origin, used for metadata, sitemap and robots.
export const SITE_URL = "https://wegobeyond.in";

// WeGoBeyond is an Unifesto initiative, run by Unifesto Private Limited.
export const ORG = {
  legalName: "Unifesto Private Limited",
  location: "Hyderabad, India",
} as const;

// The beyond space's custom domain on Unifesto: its home is the space page, events
// live under /event. Sign-in there is by email code (Google stays on unifesto.app).
const EVENTS_HOST = "https://events.wegobeyond.in";

export const LINKS = {
  whatsOn: `${EVENTS_HOST}/`,
} as const;

// Registration always happens on the Unifesto event page.
export const UNIFESTO = {
  // NEXT_PUBLIC_UNIFESTO_API points a local build at another backend; prod uses the default.
  api: process.env.NEXT_PUBLIC_UNIFESTO_API || "https://api.unifesto.app",
  spaceSlug: "beyond",
  eventUrl: (slug: string) => `${EVENTS_HOST}/event/${encodeURIComponent(slug)}`,
  // Register buttons: tagged so these sign-ups show as "wegobeyond" in the event's
  // sources, with a "Back to wegobeyond.in" link once they're done.
  registerUrl: (slug: string) =>
    `${EVENTS_HOST}/event/${encodeURIComponent(slug)}?${new URLSearchParams({
      utm_source: "wegobeyond",
      utm_medium: "website",
      return: `${SITE_URL}/`,
    })}`,
} as const;

/**
 * A page's title, description, canonical and share tags. A page's openGraph and
 * twitter replace the layout's rather than merging, so the shared fields and the site
 * card are set again here. Pass ownCard when the segment has its own opengraph-image
 * file: images set here would win over it.
 */
export function pageMetadata(title: string, description: string, path: string, ownCard = false): Metadata {
  const shareTitle = `${title} · WeGoBeyond`;
  const card = (src: string) => (ownCard ? {} : { images: [src] });
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: shareTitle,
      description,
      url: path,
      siteName: "WeGoBeyond",
      locale: "en_IN",
      type: "website",
      ...card("/opengraph-image"),
    },
    twitter: { card: "summary_large_image", title: shareTitle, description, ...card("/twitter-image") },
  };
}

export type Social = { network: "instagram" | "linkedin" | "x" | "youtube"; label: string; href: string };
export type Release = { date: string; title: string; body: string };
// "The crew." credits. Each shows as "Role at Event", or just "Role" when there's no event.
export type Member = { name: string; role: string; event?: string };
export type Photo = { src: string; alt: string; caption: string };

// GET /wegobeyond/content: the six documents, keyed by name (null if one is missing).
type Docs = {
  initiatives: { initiatives: Initiative[] };
  gallery: { photos: Photo[] };
  team: { members: Member[] };
  press: { boilerplate: string; pressEmail: string; releases: Release[] };
  crew: CrewFormDef;
  settings: {
    heroLead: string;
    partnersInbox: string;
    supportInbox: string;
    /** The WeGoBeyond WhatsApp community invite. Empty or missing until one is set in Apex. */
    communityUrl?: string;
    /** A Razorpay Payment Page for backing the community. Empty or missing until one is set in Apex. */
    supportUrl?: string;
    contacts: { role: string; addr: string }[];
    socials: (Social & { brand: string })[];
    policies: { label: string; href: string }[];
  };
};

// Apex edits show here within about a minute (the API is cached for 60s too).
const REVALIDATE_SECONDS = 60;

/**
 * The site's editable content, from Unifesto. Fetched once per render (Next dedupes
 * the call) and cached between renders. Throws if Unifesto can't be read: a build
 * fails loudly, and a live page keeps serving its last good copy.
 */
export async function getContent() {
  const res = await fetch(`${UNIFESTO.api}/wegobeyond/content`, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Unifesto /wegobeyond/content responded ${res.status}`);
  const d = (await res.json()) as { [K in keyof Docs]: Docs[K] | null };
  const missing = Object.keys(d).filter((k) => !d[k as keyof Docs]);
  if (missing.length) throw new Error(`Unifesto WeGoBeyond content is missing: ${missing.join(", ")}`);
  const { initiatives, gallery, team, press, crew, settings } = d as Docs;

  return {
    heroLead: settings.heroLead,
    // Shared inboxes only, never personal addresses.
    partnersInbox: settings.partnersInbox,
    supportInbox: settings.supportInbox,
    community: settings.communityUrl || null,
    // Razorpay hosts the payment and the receipt; the site never lists who gave.
    support: settings.supportUrl || null,
    contacts: settings.contacts,
    // Unifesto runs WeGoBeyond, so Unifesto's policies apply here: linked, never copied.
    policies: settings.policies,
    // Stored flat; grouped by brand for the footer.
    socials: settings.socials.reduce<{ brand: string; accounts: Social[] }[]>((groups, s) => {
      const group = groups.find((g) => g.brand === s.brand) ?? groups[groups.push({ brand: s.brand, accounts: [] }) - 1];
      group.accounts.push({ network: s.network, label: s.label, href: s.href });
      return groups;
    }, []),
    releases: [...press.releases].sort((a, b) => b.date.localeCompare(a.date)),
    boilerplate: press.boilerplate,
    pressEmail: press.pressEmail,
    team: team.members,
    gallery: gallery.photos,
    initiatives: initiatives.initiatives,
    crewForm: crew,
  };
}
