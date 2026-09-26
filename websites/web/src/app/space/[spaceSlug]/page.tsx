import type { Metadata } from "next";
import { getSpaceBySlug } from "@/lib/api/spaces";
import SpaceDetailClient from "./SpaceDetailClient";

interface Props {
  params: Promise<{ spaceSlug: string }>;
}

/** Plain-text, length-capped summary for meta description / OG. */
function toSummary(input: string | undefined, max = 180): string | undefined {
  if (!input) return undefined;
  const text = input
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Per-URL metadata for a shared space link. Server-rendered so crawlers get
 * real tags; the OG image comes from the sibling `opengraph-image.tsx` route
 * (banner/logo when present, branded card otherwise).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { spaceSlug } = await params;
  const space = await getSpaceBySlug(spaceSlug);

  if (!space) {
    return {
      title: "Space not found | Unifesto",
      robots: { index: false, follow: false },
    };
  }

  const title = `${space.name} | Unifesto`;
  const description =
    toSummary(space.description) ??
    `${space.name} on Unifesto — discover events, register, and connect with the community.`;

  const canonical = `/space/${space.slug}`;

  // White-label favicon (already gated server-side); default icon otherwise.
  const faviconUrl = space.branding?.faviconUrl ?? null;

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

export default function SpacePage({ params }: Props) {
  return <SpaceDetailClient params={params} />;
}
