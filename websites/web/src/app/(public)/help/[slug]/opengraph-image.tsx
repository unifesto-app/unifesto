import { ImageResponse } from "next/og";
import { Question } from "@unifesto/unicon/react";
import { getHelpArticle } from "@/lib/api/help";
import { BRAND, OG_SIZE, OgCard, loadOgBase, plain } from "@/lib/og";

export const alt = "Unifesto help";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const [article, base] = await Promise.all([getHelpArticle(slug).catch(() => null), loadOgBase()]);
  // Same first non-heading line the page uses for its meta description.
  const intro = article?.body.split("\n").find((l) => l.trim() && !l.trim().startsWith("#"));

  return new ImageResponse(
    (
      <OgCard
        wordmark={base.wordmark}
        kind={article?.category ? `Help · ${article.category}` : "Help"}
        title={article?.title ?? "Unifesto help"}
        subtitle={plain(intro)}
        icon={<Question size={210} color={BRAND.text} weight="duotone" />}
      />
    ),
    { ...size, fonts: base.fonts },
  );
}
