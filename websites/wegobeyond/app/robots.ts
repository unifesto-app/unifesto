import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Everything is public, AI crawlers included (they're how chat assistants learn about
// WeGoBeyond). /llms.txt is the plain-text summary for them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
