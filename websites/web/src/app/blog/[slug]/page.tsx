import type { Metadata } from "next";
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
    return { title: "Post not found | Unifesto", robots: { index: false } };
  }
  const title = `${post.title} | Unifesto Blog`;
  return {
    title,
    description: post.excerpt,
    openGraph: {
      title,
      description: post.excerpt,
      type: "article",
      siteName: "Unifesto",
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl }] } : {}),
    },
    twitter: {
      card: post.coverImageUrl ? "summary_large_image" : "summary",
      title,
      description: post.excerpt,
    },
  };
}

// Dark-theme styling for the rendered Markdown.
const mdComponents = {
  h1: (p: React.ComponentProps<"h1">) => (
    <h1 className="mt-10 text-3xl font-bold tracking-tight text-white" {...p} />
  ),
  h2: (p: React.ComponentProps<"h2">) => (
    <h2 className="mt-10 text-2xl font-bold tracking-tight text-white" {...p} />
  ),
  h3: (p: React.ComponentProps<"h3">) => (
    <h3 className="mt-8 text-xl font-semibold text-white" {...p} />
  ),
  p: (p: React.ComponentProps<"p">) => (
    <p className="mt-5 leading-relaxed text-slate-300" {...p} />
  ),
  a: (p: React.ComponentProps<"a">) => (
    <a className="text-primary underline underline-offset-4 hover:text-[#1f83ff]" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul className="mt-5 list-disc space-y-2 pl-6 text-slate-300" {...p} />
  ),
  ol: (p: React.ComponentProps<"ol">) => (
    <ol className="mt-5 list-decimal space-y-2 pl-6 text-slate-300" {...p} />
  ),
  li: (p: React.ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  blockquote: (p: React.ComponentProps<"blockquote">) => (
    <blockquote className="mt-6 border-l-2 border-primary/40 pl-4 italic text-slate-400" {...p} />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-sm text-slate-200" {...p} />
  ),
  pre: (p: React.ComponentProps<"pre">) => (
    <pre className="mt-6 overflow-x-auto rounded-xl border border-white/10 bg-[#0a0a0d] p-4 text-sm text-slate-200" {...p} />
  ),
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  img: (p: React.ComponentProps<"img">) => (
    <img className="mt-6 w-full rounded-xl border border-white/10" {...p} />
  ),
  hr: () => <hr className="my-10 border-white/10" />,
};

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return (
      <main className="min-h-screen bg-[#050507] text-white">
        <Navbar />
        <section className="px-6 pt-40 pb-24 text-center">
          <h1 className="text-3xl font-bold">Post not found</h1>
          <p className="mt-3 text-slate-400">
            This story may have moved or been unpublished.
          </p>
          <Link
            href="/blog"
            className="mt-6 inline-block rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-white/20 hover:text-white"
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
    <main className="min-h-screen overflow-x-hidden bg-[#050507] text-white">
      <Navbar />

      <article className="px-6 pt-36 pb-20">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/blog"
            className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
          >
            ← Blog
          </Link>

          <span className="mt-6 inline-block rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs font-semibold text-primary">
            {post.category}
          </span>

          <h1 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-[-0.02em] md:text-5xl">
            {post.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-slate-400">
            <span className="text-slate-300">{post.author}</span>
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
              className="mt-8 w-full rounded-2xl border border-white/10 object-cover"
            />
          )}

          <div className="mt-8">
            <ReactMarkdown components={mdComponents}>
              {post.content}
            </ReactMarkdown>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
