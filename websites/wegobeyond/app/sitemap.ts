import type { MetadataRoute } from "next";
import { SITE_URL, getContent } from "@/lib/site";

// Every public page, plus the gallery photos on the home page. No lastModified: the
// content has no reliable edit date, and a date that changes every build is ignored.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { initiatives, gallery } = await getContent();
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1, images: gallery.map((p) => p.src) },
    ...initiatives.map((i) => ({
      url: `${SITE_URL}/initiative/${i.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/encore`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/crew`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/volunteer`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
