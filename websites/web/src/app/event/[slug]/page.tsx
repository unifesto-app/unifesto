import type { Metadata } from "next";
import { optimized } from "@/lib/img";
import { withSocial } from "@/lib/seo";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { preload } from "react-dom";
import { getEventBySlug as fetchEvent, registrationState, UnavailableError, type Event } from "@/lib/api/events";
import Unavailable from "@/components/site/Unavailable";
import JsonLd from "@/components/site/JsonLd";
import { SITE } from "@/lib/site";
import { getTenant } from "@/lib/tenant";
import EventDetailClient from "./EventDetailClient";
import { getRateCard } from "@/lib/api/rate-card";
import { buyerFeeText } from "@/lib/site";

// One fetch per request, shared by generateMetadata and the page. An event
// whose space is taken down for now comes back as "unavailable" (J16).
const getEventBySlug = cache((slug: string) =>
  fetchEvent(slug).catch((e) => {
    if (e instanceof UnavailableError) return "unavailable" as const;
    throw e;
  }),
);

/** Drafts and space-only events aren't public; private ones stay reachable by direct link. */
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
  if (event === "unavailable") return { title: "Temporarily unavailable", robots: { index: false } };

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
   and AI crawlers that never run the client bundle still read the essentials.
   A white-labelled event points at its space's custom domain, not ours. */
function eventLd(event: Event) {
  const domain = event.branding?.customDomain;
  const base = domain ? `https://${domain}` : SITE.url;
  const url = `${base}/event/${event.slug}`;
  // K2: event_type is IN_PERSON | ONLINE | HYBRID; a hybrid event has both.
  const mode = (event.event_type ?? "").toUpperCase();
  const online = mode === "ONLINE";
  const host = event.space ?? event.organization;
  const image = event.banner_url ?? event.image_url ?? event.thumbnail_url;
  const place = {
    "@type": "Place",
    name: event.venue || event.city || "Venue to be announced",
    address: {
      "@type": "PostalAddress",
      addressLocality: event.city,
      addressRegion: event.state,
      addressCountry: event.country || "IN",
    },
  };
  const virtual = { "@type": "VirtualLocation", url };
  // What the Register button would say, never a blanket InStock. A sale that
  // has ended (not sold out) has no honest schema.org value, so it's omitted.
  const availability = {
    open: "https://schema.org/InStock",
    upcoming: "https://schema.org/PreOrder",
    sold_out: "https://schema.org/SoldOut",
    closed: undefined,
  }[registrationState(event.tickets, Date.now())];
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: toSummary(event.short_description) ?? toSummary(event.description, 500),
    startDate: event.start_date,
    endDate: event.end_date || undefined,
    eventStatus:
      event.status?.toUpperCase() === "CANCELLED"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : mode === "HYBRID"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
    location: online ? virtual : mode === "HYBRID" ? [place, virtual] : place,
    image: image ? [image] : undefined,
    url,
    organizer: host
      ? { "@type": "Organization", name: host.name, url: domain ? `${base}/` : host.slug ? `${SITE.url}/space/${host.slug}` : undefined }
      : { "@type": "Organization", name: SITE.name, url: SITE.url },
    offers: {
      "@type": "Offer",
      url,
      price: event.is_free || event.has_free_tickets ? 0 : (event.price ?? 0),
      priceCurrency: event.currency || "INR",
      availability,
      validFrom: event.registration_start,
    },
  };
}

export default async function EventDetailPage({ params }: Props) {
  // The interactive UI stays a client component; the server layer emits
  // metadata and structured data and hands it the one event fetch.
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (event === "unavailable") return <Unavailable what="event" />;
  if (!isPublic(event)) notFound();
  // An old slug (renamed event) or an id resolves too: go to the current address.
  if (event.slug && event.slug !== slug) redirect(`/event/${event.slug}`);
  await assertOnTenant(event);
  const { buyerFee, buyerFeeCap } = await getRateCard();
  // The poster is the LCP element but only appears after the client fetch;
  // preloading it from the server HTML starts the download immediately.
  const poster = event.banner_url || event.thumbnail_url || event.image_url;
  if (poster) preload(optimized(poster), { as: "image", fetchPriority: "high" });
  return (
    <>
      <JsonLd data={eventLd(event)} />
      <EventDetailClient event={event} buyerFee={buyerFeeText(buyerFee, buyerFeeCap)} />
    </>
  );
}
