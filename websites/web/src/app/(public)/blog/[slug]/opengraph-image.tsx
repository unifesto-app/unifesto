import { ImageResponse } from "next/og";
import { getPost, postMeta } from "@/lib/api/blog";
import { OG_SIZE, OgCard, fetchImageAsDataUrl, loadOgBase } from "@/lib/og";

export const alt = "Unifesto Blog";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug).catch(() => null);
  const [cover, base] = await Promise.all([fetchImageAsDataUrl(post?.coverImageUrl), loadOgBase()]);
  const m = post ? postMeta(post) : null;

  return new ImageResponse(
    (
      <OgCard
        wordmark={base.wordmark}
        kind="Blog"
        title={post?.title ?? "Unifesto Blog"}
        subtitle={post?.excerpt}
        meta={[post?.author, m && [m.date, m.readTime].filter(Boolean).join(" · ")]}
        // Covers ride along as artwork; without one the card goes text-only.
        image={cover ?? undefined}
      />
    ),
    { ...size, fonts: base.fonts },
  );
}
