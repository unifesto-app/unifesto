import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import { getPosts, postMeta, type BlogPostSummary as BlogPost } from "@/lib/api/blog";

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
      <span className="blur-bg relative rounded-full px-3 py-1 text-xs font-semibold text-paper">
        {post.category}
      </span>
    </div>
  );
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group grid overflow-hidden rounded-3xl bg-night-2 transition-colors duration-150 hover:bg-night-3 md:grid-cols-2"
    >
      <CardImage post={post} large />
      <div className="flex flex-col justify-center gap-4 p-8 md:p-10">
        <h2 className="font-display text-2xl font-bold leading-snug text-paper md:text-3xl" style={{ letterSpacing: "-0.03em" }}>
          {post.title}
        </h2>
        <p className="text-pretty text-sm leading-relaxed text-paper/75 md:text-base">
          {post.excerpt}
        </p>
        <Meta post={post} />
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
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-3xl bg-night-2 transition-colors duration-150 hover:bg-night-3"
    >
      <CardImage post={post} />
      <div className="flex flex-1 flex-col gap-3 p-6">
        <h3 className="text-lg font-semibold leading-snug text-paper">
          {post.title}
        </h3>
        <p className="text-sm leading-relaxed text-paper/75">{post.excerpt}</p>
        <div className="mt-auto pt-1">
          <Meta post={post} />
        </div>
      </div>
    </Link>
  );
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const selected = category ?? "all";

  const allPosts = await getPosts();
  // K11: an empty blog is a 404 (not indexed), and Navbar/Footer hide its link.
  if (!allPosts.length) notFound();
  const categories = ["all", ...Array.from(new Set(allPosts.map((p) => p.category)))];
  const posts =
    selected === "all"
      ? allPosts
      : allPosts.filter((p) => p.category === selected);

  const featuredPost = posts.find((p) => p.featured);
  const regularPosts = posts.filter((p) => p !== featuredPost);

  const pills =
    categories.length > 1 ? (
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const active = cat === selected;
          return (
            <Link
              key={cat}
              href={cat === "all" ? "/blog" : `/blog?category=${encodeURIComponent(cat)}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
                active ? "bg-primary text-ink" : "bg-paper/[0.06] text-paper/75 hover:bg-paper/[0.1] hover:text-paper"
              }`}
            >
              {cat === "all" ? "All" : cat}
            </Link>
          );
        })}
      </div>
    ) : undefined;

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />

      <PageHero
        lines={["Notes from running", "events."]}
        accentFrom={1}
        size="md"
        lede="Product updates, event tips and community stories from the team building Unifesto."
        actions={pills}
      />

      {posts.length === 0 ? (
        <Section surface="night" pad="tight">
          <div className="rounded-3xl bg-night-2 p-12 text-center">
            <h2 className="text-xl font-semibold text-paper">No posts yet</h2>
            <p className="mt-2 text-paper/65">Check back soon for stories and updates from the team.</p>
          </div>
        </Section>
      ) : (
        <>
          {featuredPost && (
            <Section surface="night" pad="tight">
              <div data-reveal="scale">
                <FeaturedCard post={featuredPost} />
              </div>
            </Section>
          )}
          {regularPosts.length > 0 && (
            <Section surface="paper">
              <h2
                data-reveal="clip"
                className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-bold text-ink"
                style={{ letterSpacing: "-0.03em" }}
              >
                Latest posts
              </h2>
              <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" data-stagger="rise">
                {regularPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      <Footer />
    </main>
  );
}
