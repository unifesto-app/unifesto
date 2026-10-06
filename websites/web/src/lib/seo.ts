import type { Metadata } from "next";
import { SITE } from "./site";

/** The site-wide share card, served by app/opengraph-image.tsx. */
const DEFAULT_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: SITE.name };

type Social = {
  /** og/twitter title; defaults to the page title with the brand appended. */
  title?: string;
  /** og/twitter description; defaults to the page description. */
  description?: string;
  type?: "website" | "article";
  /** false on routes with their own opengraph-image file, so that file wins. */
  image?: boolean;
};

function pageTitle(title: Metadata["title"]): string | undefined {
  const t = typeof title === "string" ? title : title && "absolute" in title ? title.absolute : undefined;
  if (!t) return undefined;
  return t.includes(SITE.name) ? t : `${t} | ${SITE.name}`;
}

/**
 * Adds complete openGraph + twitter tags to a page's metadata. Next merges
 * metadata shallowly, so a page that sets its own `openGraph` silently drops
 * the layout's image, site name and locale. Every page goes through here.
 */
export function withSocial(meta: Metadata, s: Social = {}): Metadata {
  const title = s.title ?? pageTitle(meta.title) ?? SITE.name;
  const description = s.description ?? meta.description ?? SITE.description;
  const canonical = meta.alternates?.canonical;
  const url = typeof canonical === "string" || canonical instanceof URL ? canonical : undefined;
  const images = s.image === false ? undefined : [DEFAULT_IMAGE];

  return {
    ...meta,
    openGraph: {
      type: s.type ?? "website",
      siteName: SITE.name,
      locale: "en_IN",
      title,
      description,
      url,
      ...(images && { images }),
    },
    twitter: {
      card: "summary_large_image",
      site: SITE.twitter,
      creator: SITE.twitter,
      title,
      description,
      ...(images && { images }),
    },
  };
}
