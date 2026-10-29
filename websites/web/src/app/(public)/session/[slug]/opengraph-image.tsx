import { ImageResponse } from "next/og";
import { getSessionBySlug, sessionPrice, sessionWhen } from "@/lib/api/sessions";
import { OG_SIZE, OgCard, fetchImageAsDataUrl, loadOgBase } from "@/lib/og";

export const alt = "Unifesto Huddle session";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const s = await getSessionBySlug(slug).catch(() => null);
  const [image, base] = await Promise.all([
    fetchImageAsDataUrl(s?.coverImageUrl ?? s?.space?.logoUrl),
    loadOgBase(),
  ]);

  return new ImageResponse(
    (
      <OgCard
        wordmark={base.wordmark}
        kind="Huddle session"
        title={s?.title ?? "Unifesto Huddle"}
        subtitle={s?.space ? `Hosted by ${s.space.name}` : null}
        meta={s ? [sessionWhen(s), `${s.durationMinutes} min · Online · ${sessionPrice(s)}`] : []}
        cta={s ? "Register" : undefined}
        image={image}
        // A cover is 4:3 like event banners; the space logo fallback is 1:1.
        imageAspect={s?.coverImageUrl ? "4:3" : "1:1"}
        imageFit={s?.coverImageUrl ? "cover" : "contain"}
      />
    ),
    { ...size, fonts: base.fonts },
  );
}
