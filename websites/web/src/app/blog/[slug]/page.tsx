import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getPost, postMeta } from "@/lib/api/blog";

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
    alternates: { canonical: `/blog/${post.slug}` },
  }, { type: "article", image: false });
}

// Dark-theme styling for the rendered Markdown.
const mdComponents = {
  h1: (p: React.ComponentProps<"h1">) => (
    <h1 className="mt-12 font-display text-3xl font-bold text-paper" style={{ letterSpacing: "-0.03em" }} {...p} />
  ),
  h2: (p: React.ComponentProps<"h2">) => (
    <h2 className="mt-12 font-display text-2xl font-bold text-paper" style={{ letterSpacing: "-0.03em" }} {...p} />
  ),
  h3: (p: React.ComponentProps<"h3">) => (
    <h3 className="mt-9 text-xl font-bold text-paper" {...p} />
  ),
  p: (p: React.ComponentProps<"p">) => (
    <p className="mt-5 text-[1.0625rem] leading-[1.75] text-paper/80 [text-wrap:pretty]" {...p} />
  ),
  a: (p: React.ComponentProps<"a">) => (
    <a className="font-medium text-primary-deep underline underline-offset-4 transition-colors duration-150 hover:text-primary" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul className="mt-5 list-disc space-y-2 pl-6 text-paper/75" {...p} />
  ),
  ol: (p: React.ComponentProps<"ol">) => (
    <ol className="mt-5 list-decimal space-y-2 pl-6 text-paper/75" {...p} />
  ),
  li: (p: React.ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  blockquote: (p: React.ComponentProps<"blockquote">) => (
    <blockquote className="mt-8 font-display text-xl font-medium leading-snug text-paper before:mr-1 before:text-primary-deep before:content-['“']" {...p} />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code className="rounded-md bg-paper/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-paper" {...p} />
  ),
  pre: (p: React.ComponentProps<"pre">) => (
    <pre className="mt-6 overflow-x-auto rounded-2xl bg-night-2 p-6 text-sm text-paper/85" {...p} />
  ),
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  img: (p: React.ComponentProps<"img">) => (
    <img className="mt-8 w-full rounded-2xl" {...p} />
  ),
  hr: () => <hr className="my-12 h-px border-0 bg-paper/15" />,
};

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

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
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
          <ReactMarkdown components={mdComponents}>{post.content}</ReactMarkdown>
        </div>
      </article>

      <Footer />
    </main>
  );
}
