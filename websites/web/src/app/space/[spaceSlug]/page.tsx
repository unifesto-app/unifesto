import type { Metadata } from "next";
import { optimized } from "@/lib/img";
import { notFound, redirect } from "next/navigation";
import { preload } from "react-dom";
import { withSocial } from "@/lib/seo";
import { getTenant } from "@/lib/tenant";
import { cache } from "react";
import { getSpaceBySlug as fetchSpace } from "@/lib/api/spaces";
import JsonLd from "@/components/site/JsonLd";
import { SITE } from "@/lib/site";
import { getSpaceSessions } from "@/lib/api/sessions";
import SpaceDetailClient from "./SpaceDetailClient";

// One fetch per request, shared by generateMetadata and the page.
const getSpaceBySlug = cache(fetchSpace);

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

  if (!space) notFound();

  // White-labelled: no Unifesto in the title or share card. A space with a
  // live custom domain lives at `/` there, so canonical + OG URLs point there,
  // also when this page is viewed on www (no redirect: old links keep working).
  const brand = space.branding?.name ?? null;
  const tenant = await getTenant();
  const home = tenant?.host ?? space.branding?.customDomain ?? null;
  const title = brand ? space.name : `${space.name} | Unifesto`;
  const description =
    toSummary(space.description) ??
    (brand
      ? `Events by ${space.name}.`
      : `${space.name} on Unifesto — discover events, register, and connect with the community.`);

  const canonical = home ? "/" : `/space/${space.slug}`;

  // White-label favicon (already gated server-side); default icon otherwise.
  const faviconUrl = space.branding?.faviconUrl ?? null;

  return withSocial({
    title: { absolute: title },
    description,
    ...(home ? { metadataBase: new URL(`https://${home}`) } : {}),
    alternates: { canonical },
    ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
  }, { image: false, ...(brand ? { title, siteName: brand } : {}) });
}

export default async function SpacePage({ params }: Props) {
  const { spaceSlug } = await params;
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  // An old slug (renamed space) resolves too: go to the current address.
  if (space.slug && space.slug !== spaceSlug) redirect(`/space/${space.slug}`);
  // Banner is the LCP element; start its download from the server HTML.
  if (space.banner_url) preload(optimized(space.banner_url), { as: "image", fetchPriority: "high" });
  // A Space is an organisation (club, institution, community) hosting events.
  const ld = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: space.name,
    url: space.branding?.customDomain ? `https://${space.branding.customDomain}/` : `${SITE.url}/space/${space.slug}`,
    description: toSummary(space.description),
    logo: space.logo_url,
    sameAs: space.website ? [space.website] : undefined,
    address: space.city
      ? { "@type": "PostalAddress", addressLocality: space.city, addressRegion: space.state, addressCountry: space.country || "IN" }
      : undefined,
  };
  return (
    <>
      <JsonLd data={ld} />
      <SpaceDetailClient params={params} initialSpace={space} sessions={await getSpaceSessions(space.id)} />
    </>
  );
}
