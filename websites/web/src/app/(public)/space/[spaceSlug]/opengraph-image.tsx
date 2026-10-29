import { ImageResponse } from "next/og";
import { getSpaceBySlug } from "@/lib/api/spaces";
import { OG_SIZE, OgCard, fetchImageAsDataUrl, loadOgBase, plain } from "@/lib/og";

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

  // Logo as a 1:1 card; else the banner as 4:3; else a monogram.
  const [logo, banner, base] = await Promise.all([
    fetchImageAsDataUrl(space?.logo_url),
    fetchImageAsDataUrl(space?.banner_url),
    loadOgBase(),
  ]);

  const members =
    typeof space?.member_count === "number" && space.member_count > 0
      ? `${space.member_count.toLocaleString("en-IN")} ${space.member_count === 1 ? "member" : "members"}`
      : null;

  return new ImageResponse(
    (
      <OgCard
        // White-labelled: the card carries the space, not Unifesto.
        wordmark={space?.branding?.name ? false : base.wordmark}
        kind="Space"
        title={space?.name ?? "Space on Unifesto"}
        subtitle={plain(space?.description)}
        meta={[members, space?.city]}
        cta={space ? "Join" : undefined}
        image={logo ?? banner}
        imageAspect={logo ? "1:1" : "4:3"}
        // White only shows through transparent logos; opaque ones cover it.
        imageBg={logo ? "#ffffff" : undefined}
      />
    ),
    { ...size, fonts: base.fonts },
  );
}
