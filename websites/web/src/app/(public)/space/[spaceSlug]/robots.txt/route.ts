import { TENANT_HOST, TENANT_SPACE } from "@/lib/tenant";

/* robots.txt on a space's custom domain (src/proxy.ts rewrites it here):
   its own sitemap and host, nothing of Unifesto's. 404 anywhere else. */
export async function GET(req: Request, { params }: { params: Promise<{ spaceSlug: string }> }) {
  const host = req.headers.get(TENANT_HOST);
  if (!host || req.headers.get(TENANT_SPACE) !== (await params).spaceSlug) {
    return new Response("Not found", { status: 404 });
  }
  const body = `User-agent: *\nAllow: /\nDisallow: /event/*/register\n\nSitemap: https://${host}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
