import type { Metadata } from "next";
import { getEventBySlug } from "@/lib/api/events";
import EventDetailClient from "./EventDetailClient";

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
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  if (!event) {
    return {
      title: "Event not found | Unifesto",
      robots: { index: false, follow: false },
    };
  }

  const hostName = event.space?.name ?? event.organization?.name;
  const title = `${event.title} | Unifesto`;
  const description =
    toSummary(event.short_description) ??
    toSummary(event.description) ??
    [hostName ? `Hosted by ${hostName}.` : null, "Discover and register on Unifesto."]
      .filter(Boolean)
      .join(" ");

  const canonical = `/event/${event.slug}`;

  // White-label favicon (space-level, already gated server-side). Falls back to
  // the app's default icon when absent.
  const faviconUrl = event.branding?.faviconUrl ?? null;

  return {
    title,
    description,
    alternates: { canonical },
    ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Unifesto",
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function EventDetailPage({ params }: Props) {
  // The heavy interactive UI stays a client component; the server layer above
  // exists only to emit metadata. Forward the same params promise straight down.
  return <EventDetailClient params={params} />;
}
