import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Markdown from "@/components/site/Markdown";
import { HeroSky } from "@/components/site/CosmicBackdrop";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { getHelpArticle } from "@/lib/api/help";
import { IST } from "@/lib/site";

interface Props {
  params: Promise<{ slug: string }>;
}

/** First non-heading line of the body, stripped of Markdown, for the meta description. */
function summary(body: string): string {
  const line = body.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";
  return line.replace(/[*_`>#\[\]]|\(.*?\)/g, "").trim().slice(0, 160);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getHelpArticle(slug);
  if (!article) return { title: "Article not found", robots: { index: false } };
  return withSocial({
    title: { absolute: `${article.title} | Unifesto help` },
    description: summary(article.body),
    alternates: { canonical: `/help/${article.slug}` },
  }, { type: "article", image: false });
}

export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getHelpArticle(slug);

  if (!article) notFound();

  const updated = new Date(article.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: IST,
  });

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd
        data={breadcrumbLd([
          { name: "Help", path: "/help" },
          { name: article.title, path: `/help/${article.slug}` },
        ])}
      />
      <Navbar />

      <header id="page-hero" className="surface-night relative overflow-hidden px-5 pb-12 pt-32 sm:px-8 md:pt-40">
        <HeroSky targetId="page-hero" />
        <div className="relative mx-auto max-w-3xl">
          <Link href="/help" className="link-draw text-sm font-medium text-paper/65 transition-colors duration-150 hover:text-paper">
            ← Help
          </Link>
          <p className="mt-8 text-sm font-semibold text-primary">{article.category}</p>
          <h1
            className="mt-3 font-display text-[clamp(2rem,4.6vw,3.25rem)] font-bold leading-[1.05] text-paper [text-wrap:balance]"
            style={{ letterSpacing: "-0.035em" }}
          >
            {article.title}
          </h1>
          <p className="mt-5 text-sm text-paper/65">Updated {updated}</p>
        </div>
      </header>

      <article className="surface-paper px-5 py-16 sm:px-8 md:py-24" data-surface="light">
        <div className="mx-auto max-w-[68ch]">
          <Markdown>{article.body}</Markdown>
          <p className="mt-16 text-sm text-paper/65">
            Still stuck?{" "}
            <Link href="/support" className="font-medium text-primary-deep underline underline-offset-4 hover:text-primary">
              Contact support
            </Link>
            .
          </p>
        </div>
      </article>

      <Footer />
    </main>
  );
}
