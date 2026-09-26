import { ImageResponse } from "next/og";
import { getSpaceBySlug } from "@/lib/api/spaces";
import { OG_SIZE, OgCard, fetchImageAsDataUrl, loadOgFonts, readPublicPngAsDataUrl } from "@/lib/og";

export const alt = "Space on Unifesto";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

interface Props {
  params: Promise<{ spaceSlug: string }>;
}

export default async function Image({ params }: Props) {
  const { spaceSlug } = await params;
  const space = await getSpaceBySlug(spaceSlug).catch(() => null);

  // Prefer the logo as a 1:1 card; fall back to the banner as a 4:3 card.
  const [logo, banner, wordmark, fonts] = await Promise.all([
    fetchImageAsDataUrl(space?.logo_url),
    fetchImageAsDataUrl(space?.banner_url),
    readPublicPngAsDataUrl("UnifestoAppWordmark.png"),
    loadOgFonts(),
  ]);

  const usingLogo = Boolean(logo);
  const image = logo ?? banner;

  const name = space?.name ?? "Unifesto";
  const summary = space?.description?.replace(/\s+/g, " ").trim() || null;
  const members =
    typeof space?.member_count === "number" && space.member_count > 0
      ? `${space.member_count.toLocaleString("en-IN")} members`
      : null;

  return new ImageResponse(
    (
      <OgCard
        wordmark={wordmark}
        title={name}
        subtitle={summary}
        meta={[members].filter((x): x is string => Boolean(x))}
        cta="Join Now"
        image={image}
        imageAspect={usingLogo ? "1:1" : "4:3"}
        // Logos fill the square card edge-to-edge (cover) so dark/edge-to-edge
        // logos don't get framed in a thick white border; white stays only as a
        // fallback behind transparent logos.
        imageFit="cover"
        imageBg={usingLogo ? "#ffffff" : undefined}
        monogram={(name[0] ?? "U").toUpperCase()}
      />
    ),
    { ...size, fonts },
  );
}
