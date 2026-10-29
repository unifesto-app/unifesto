import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/* Public pages are open to every crawler, including AI search and answer
   engines, named explicitly so an over-broad default never shuts them out.
   Private and transactional routes stay out of every index. */
const PRIVATE = ["/api/", "/auth/", "/claim/", "/signup", "/download", "/event/*/register"];

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "meta-externalagent",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
