import type { Metadata } from "next";
import { optimized } from "@/lib/img";
import { withSocial } from "@/lib/seo";
import { cache } from "react";
import { notFound } from "next/navigation";
import { preload } from "react-dom";
import { getEventBySlug as fetchEvent, type Event } from "@/lib/api/events";
import JsonLd from "@/components/site/JsonLd";
import { SITE } from "@/lib/site";
import { getTenant } from "@/lib/tenant";
import EventDetailClient from "./EventDetailClient";

// One fetch per request, shared by generateMetadata and the page.
const getEventBySlug = cache(fetchEvent);

/** Same rule as EventDetailClient: drafts and space-only events aren't public. */
const isPublic = (e: Event | null): e is Event =>
  !!e && e.status !== "DRAFT" && e.visibility !== "SPACE_ONLY";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Plain-text, length-capped summary for meta description / OG. */
function toSummary(input: string | undefined, max = 180): string | undefined {
  if (!input) return undefined;
  const text = input
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // strip markdown images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // unwrap markdown links
    .replace(/[#*_>`~-]/g, " ") // drop markdown punctuation
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Per-URL metadata for a shared event link. Runs on the server so crawlers
 * (WhatsApp, Slack, iMessage, X, LinkedIn) receive real title/description/OG
 * tags without executing the client bundle. The OG image itself is produced by
 * the sibling `opengraph-image.tsx` route (banner when present, branded card
 * otherwise) and injected automatically by the App Router file convention.
 */
/** On a space's custom domain, only that space's events exist. */
async function assertOnTenant(event: Event) {
  const tenant = await getTenant();
  if (tenant && (event.space?.slug ?? event.organization?.slug) !== tenant.spaceSlug) notFound();
  return tenant;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  // A real 404 (not a 200 + noindex soft-404) so Google drops deleted events.
  if (!isPublic(event)) notFound();
  const tenant = await assertOnTenant(event);

  // A space with a live custom domain is canonical there, so search engines
  // index one address; www links keep working (no redirect).
  const home = tenant?.host ?? event.branding?.customDomain ?? null;

  // White-labelled: the space's name replaces ours in titles and share cards.
  const brand = event.branding?.name ?? null;
  const hostName = event.space?.name ?? event.organization?.name;
  const title = `${event.title} | ${brand ?? "Unifesto"}`;
  const description =
    toSummary(event.short_description) ??
    toSummary(event.description) ??
    [hostName ? `Hosted by ${hostName}.` : null, brand ? null : "Discover and register on Unifesto."]
      .filter(Boolean)
      .join(" ");

  const canonical = `/event/${event.slug}`;

  // White-label favicon (space-level, already gated server-side). Falls back to
  // the app's default icon when absent.
  const faviconUrl = event.branding?.faviconUrl ?? null;

  return withSocial({
    title: { absolute: title },
    description,
    // Canonical + OG URLs point at the custom domain when there is one.
    ...(home ? { metadataBase: new URL(`https://${home}`) } : {}),
    alternates: { canonical },
    ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
    // Safari Smart App Banner; app-argument opens this event if installed.
    other: {
      "apple-itunes-app": `app-id=6767165496, app-argument=https://unifesto.app${canonical}`,
    },
  }, { image: false, ...(brand ? { title, siteName: brand } : {}) });
}

/* schema.org Event, server-rendered, so search engines (event rich results)
   and AI crawlers that never run the client bundle still read the essentials. */
function eventLd(event: Event) {
  const online = /online|virtual/i.test(event.event_type ?? "");
  const host = event.space ?? event.organization;
  const image = event.banner_url ?? event.image_url ?? event.thumbnail_url;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: toSummary(event.short_description) ?? toSummary(event.description, 500),
    startDate: event.start_date,
    endDate: event.end_date || undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: online
      ? { "@type": "VirtualLocation", url: `${SITE.url}/event/${event.slug}` }
      : {
          "@type": "Place",
          name: event.venue || event.city || "Venue to be announced",
          address: {
            "@type": "PostalAddress",
            addressLocality: event.city,
            addressRegion: event.state,
            addressCountry: event.country || "IN",
          },
        },
    image: image ? [image] : undefined,
    url: `${SITE.url}/event/${event.slug}`,
    organizer: host
      ? { "@type": "Organization", name: host.name, url: host.slug ? `${SITE.url}/space/${host.slug}` : undefined }
      : { "@id": `${SITE.url}/#org` },
    offers: {
      "@type": "Offer",
      url: `${SITE.url}/event/${event.slug}`,
      price: event.is_free || event.has_free_tickets ? 0 : (event.price ?? 0),
      priceCurrency: event.currency || "INR",
      availability: "https://schema.org/InStock",
      validFrom: event.registration_start,
    },
  };
}

export default async function EventDetailPage({ params }: Props) {
  // The interactive UI stays a client component; the server layer emits
  // metadata and structured data. Forward the same params promise down.
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!isPublic(event)) notFound();
  await assertOnTenant(event);
  // The poster is the LCP element but only appears after the client fetch;
  // preloading it from the server HTML starts the download immediately.
  const poster = event.banner_url || event.thumbnail_url || event.image_url;
  if (poster) preload(optimized(poster), { as: "image", fetchPriority: "high" });
  return (
    <>
      <JsonLd data={eventLd(event)} />
      <EventDetailClient params={params} initialEvent={event} />
    </>
  );
}
