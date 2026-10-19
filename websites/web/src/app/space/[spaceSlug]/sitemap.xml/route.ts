import { getSpaceBySlug, getSpaceEvents } from "@/lib/api/spaces";
import { TENANT_HOST, TENANT_SPACE } from "@/lib/tenant";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/* sitemap.xml on a space's custom domain (src/proxy.ts rewrites it here):
   the space home and its listed events on that domain. 404 anywhere else. */
export async function GET(req: Request, { params }: { params: Promise<{ spaceSlug: string }> }) {
  const host = req.headers.get(TENANT_HOST);
  const { spaceSlug } = await params;
  if (!host || req.headers.get(TENANT_SPACE) !== spaceSlug) return new Response("Not found", { status: 404 });

  const base = `https://${host}`;
  const space = await getSpaceBySlug(spaceSlug).catch(() => null);
  // ponytail: first 200 events; page through when a space outgrows that.
  const { events } = space ? await getSpaceEvents(space.id, 1, 200) : { events: [] };
  const urls = [
    { loc: `${base}/`, lastmod: space?.updated_at },
    ...events
      .filter((e) => e.slug && e.status !== "DRAFT" && e.visibility !== "SPACE_ONLY" && e.visibility !== "PRIVATE")
      .map((e) => ({ loc: `${base}/event/${e.slug}`, lastmod: e.updated_at })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(({ loc, lastmod }) => `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${esc(new Date(lastmod).toISOString())}</lastmod>` : ""}</url>`)
      .join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
