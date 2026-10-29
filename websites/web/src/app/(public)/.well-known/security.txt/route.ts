import { LEGAL } from "@/lib/legal";
import { SITE } from "@/lib/site";

/* RFC 9116 security.txt: where to report a vulnerability. `Expires` must
   be under a year out, so it is computed at build time; redeploys keep it
   fresh. */
export const dynamic = "force-static";

export function GET() {
  const expires = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    `Contact: mailto:${LEGAL.email.security}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Canonical: ${SITE.url}/.well-known/security.txt`,
    `Policy: ${SITE.url}/security`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
