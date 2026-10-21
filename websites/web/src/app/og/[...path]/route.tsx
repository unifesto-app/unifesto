import { ImageResponse } from "next/og";
import { OG_PAGES } from "@/lib/og-pages";
import { BRAND, OG_SIZE, OgCard, loadOgBase } from "@/lib/og";

// Every card is rendered once at build time; unknown paths 404.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(OG_PAGES).map((p) => ({ path: p.slice(1).split("/") }));
}

/** Share card for a static page: /og/pricing → OG_PAGES["/pricing"]. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const page = OG_PAGES[`/${path.join("/")}`];
  if (!page) return new Response("Not found", { status: 404 });
  const { icon: Icon, ...copy } = page;
  const base = await loadOgBase();

  return new ImageResponse(
    <OgCard wordmark={base.wordmark} {...copy} icon={<Icon size={210} color={BRAND.text} weight="duotone" />} />,
    { ...OG_SIZE, fonts: base.fonts },
  );
}
