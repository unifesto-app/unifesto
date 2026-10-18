import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import Markdown from "@/components/site/Markdown";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JsonLd, { breadcrumbLd, faqLd } from "@/components/site/JsonLd";
import { getPost, postMeta } from "@/lib/api/blog";
import { SITE } from "@/lib/site";
import { postFaqs } from "@/lib/blog-faq";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) {
    return { title: "Post not found", robots: { index: false } };
  }
  const title = `${post.title} | Unifesto Blog`;
  return withSocial({
    title: { absolute: title },
    description: post.excerpt,
    alternates: {
      canonical: `/blog/${post.slug}`,
      types: { "application/rss+xml": "/blog/rss.xml" },
    },
  }, { type: "article", image: false });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return (
      <main className="min-h-screen bg-canvas">
        <Navbar />
        <section className="px-6 pb-24 pt-40 text-center">
          <h1 className="font-display text-3xl font-bold text-paper">Post not found</h1>
          <p className="mt-3 text-paper/65">
            This story may have moved or been unpublished.
          </p>
          <Link
            href="/blog"
            className="btn btn-secondary mt-8"
          >
            Back to blog
          </Link>
        </section>
        <Footer />
      </main>
    );
  }

  const { date, readTime } = postMeta(post);
  const url = `${SITE.url}/blog/${post.slug}`;
  const postLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    url,
    mainEntityOfPage: url,
    image: post.coverImageUrl ?? `${url}/opengraph-image`,
    datePublished: post.publishedAt ?? post.createdAt,
    dateModified: post.updatedAt,
    articleSection: post.category,
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      logo: { "@type": "ImageObject", url: SITE.logo },
    },
  };
  const faqs = postFaqs(post.content);

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd
        data={[
          postLd,
          breadcrumbLd([
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
          ...(faqs.length ? [faqLd(faqs)] : []),
        ]}
      />
      <Navbar />

      <header className="surface-night px-5 pb-12 pt-32 sm:px-8 md:pt-40">
        <div className="mx-auto max-w-3xl">
          <Link href="/blog" className="link-draw text-sm font-medium text-paper/65 transition-colors duration-150 hover:text-paper">
            ← Blog
          </Link>
          <p className="mt-8 text-sm font-semibold text-primary">{post.category}</p>
          <h1
            className="waterline-load mt-3 font-display text-[clamp(2rem,4.6vw,3.25rem)] font-bold leading-[1.05] text-paper [text-wrap:balance]"
            style={{ letterSpacing: "-0.035em" }}
          >
            <span className="line">
              <span className="line-inner">{post.title}</span>
            </span>
          </h1>
          <div className="enter mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-paper/65" style={{ ["--d" as string]: "300ms" }}>
            <span className="text-paper/85">{post.author}</span>
            <span aria-hidden>·</span>
            <span>{date}</span>
            {readTime && (
              <>
                <span aria-hidden>·</span>
                <span>{readTime}</span>
              </>
            )}
          </div>
          {post.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverImageUrl}
              alt={post.title}
              className="enter mt-10 w-full rounded-3xl object-cover"
              style={{ ["--d" as string]: "420ms" }}
            />
          )}
        </div>
      </header>

      <article className="surface-paper px-5 py-16 sm:px-8 md:py-24" data-surface="light">
        <div className="mx-auto max-w-[68ch]">
          <Markdown>{post.content}</Markdown>
        </div>
      </article>

      <Footer />
    </main>
  );
}
