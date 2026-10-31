import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import { getPosts, postMeta, type BlogPostSummary as BlogPost } from "@/lib/api/blog";
import { CategoryPills, Posts, type PostRow } from "./BlogIndex";

export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
  title: "Blog",
  description:
    "Stories, insights, and updates from the Unifesto team about events, community life, and event management best practices.",
  keywords: [
    "unifesto blog",
    "community events blog",
    "event management tips",
    "community life",
    "event stories",
  ],
}, { title: "Unifesto Blog", description: "Stories, insights, and updates from the Unifesto team about events and community life." });

function Meta({ post }: { post: BlogPost }) {
  const { date, readTime } = postMeta(post);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-paper/65">
      <span className="text-paper/75">{post.author}</span>
      <span aria-hidden>·</span>
      <span>{date}</span>
      {readTime && (
        <>
          <span aria-hidden>·</span>
          <span>{readTime}</span>
        </>
      )}
    </div>
  );
}

function CardImage({ post, large }: { post: BlogPost; large?: boolean }) {
  return (
    <div
      className={`relative flex items-end overflow-hidden bg-night-3 p-6 ${
        large ? "min-h-[220px]" : "aspect-video"
      }`}
    >
      {post.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] ease-[cubic-bezier(.19,1,.22,1)] group-hover:scale-[1.04]"
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_80%_0%,rgb(var(--glow)/0.2),transparent_60%)]"
        />
      )}
      <span className="blur-bg relative rounded-lg px-3 py-1 text-xs font-semibold text-paper">
        {post.category}
      </span>
    </div>
  );
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group grid overflow-hidden rounded-xl bg-night-2 md:grid-cols-2">
      <CardImage post={post} large />
      <div className="flex flex-col justify-center gap-4 p-8 md:p-10">
        <h2 className="font-display text-2xl font-bold leading-snug text-paper md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
          {post.title}
        </h2>
        <p className="text-pretty text-sm leading-relaxed text-paper/75 md:text-base">
          {post.excerpt}
        </p>
        <div className="border-t border-border pt-4">
          <Meta post={post} />
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          Read article
          <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group flex h-full flex-col overflow-hidden rounded-xl bg-night-2">
      <CardImage post={post} />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <h3 className="text-lg font-semibold leading-snug text-paper">
          {post.title}
        </h3>
        <p className="text-sm leading-relaxed text-paper/75">{post.excerpt}</p>
        <div className="mt-auto border-t border-border pt-4">
          <Meta post={post} />
        </div>
      </div>
    </Link>
  );
}

export default async function BlogPage() {
  const allPosts = await getPosts();
  // K11: an empty blog is a 404 (not indexed), and Navbar/Footer hide its link.
  if (!allPosts.length) notFound();
  const categories = ["all", ...Array.from(new Set(allPosts.map((p) => p.category)))];
  const rows: PostRow[] = allPosts.map((post) => ({
    id: post.id,
    category: post.category,
    featured: post.featured,
    featuredCard: <FeaturedCard post={post} />,
    card: <PostCard post={post} />,
  }));

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />

      <PageHero
        lines={["Notes from running", "events."]}
        accentFrom={1}
        size="md"
        lede="Product updates, event tips and community stories from the team building Unifesto."
        actions={categories.length > 1 ? <CategoryPills categories={categories} /> : undefined}
      />

      <Posts rows={rows} />

      <Footer />
    </main>
  );
}
