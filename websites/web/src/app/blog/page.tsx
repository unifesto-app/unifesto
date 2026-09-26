import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getPosts, postMeta, type BlogPost } from "@/lib/api/blog";

export const metadata = {
  title: "Blog | Unifesto",
  description:
    "Stories, insights, and updates from the Unifesto team about events, community life, and event management best practices.",
  keywords: [
    "unifesto blog",
    "community events blog",
    "event management tips",
    "community life",
    "event stories",
  ],
  openGraph: {
    title: "Blog | Unifesto",
    description:
      "Stories, insights, and updates from the Unifesto team about events and community life.",
    type: "website",
    url: "https://www.unifesto.app/blog",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | Unifesto",
    description:
      "Stories, insights, and updates from the Unifesto team about events and community life.",
    site: "@unifestoapp",
  },
};

function Meta({ post }: { post: BlogPost }) {
  const { date, readTime } = postMeta(post);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
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
  );
}

function CardImage({ post, large }: { post: BlogPost; large?: boolean }) {
  return (
    <div
      className={`relative flex items-end overflow-hidden bg-[#0a0a0d] p-5 ${
        large ? "min-h-[220px]" : "aspect-video"
      }`}
    >
      {post.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_80%_0%,rgba(52,145,255,0.2),transparent_60%)]"
        />
      )}
      <span className="relative rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs font-semibold text-primary backdrop-blur-sm">
        {post.category}
      </span>
    </div>
  );
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.05] md:grid-cols-2"
    >
      <CardImage post={post} large />
      <div className="flex flex-col justify-center gap-4 p-6 md:p-8">
        <h2 className="text-2xl font-bold leading-snug tracking-[-0.02em] text-white md:text-3xl">
          {post.title}
        </h2>
        <p className="text-pretty text-sm leading-relaxed text-slate-300 md:text-base">
          {post.excerpt}
        </p>
        <Meta post={post} />
        <span className="text-sm font-medium text-primary transition-transform duration-200 group-hover:translate-x-0.5">
          Read article →
        </span>
      </div>
    </Link>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.05]"
    >
      <CardImage post={post} />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-lg font-semibold leading-snug text-white">
          {post.title}
        </h3>
        <p className="text-sm leading-relaxed text-slate-300">{post.excerpt}</p>
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
  const categories = ["all", ...Array.from(new Set(allPosts.map((p) => p.category)))];
  const posts =
    selected === "all"
      ? allPosts
      : allPosts.filter((p) => p.category === selected);

  const featuredPost = posts.find((p) => p.featured);
  const regularPosts = posts.filter((p) => p !== featuredPost);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050507] text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative px-6 pt-36 pb-16 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[360px] w-[640px] -translate-x-1/2 rounded-full bg-primary/12 blur-[130px]"
        />
        <div className="relative mx-auto max-w-3xl">
          <h1 className="text-balance text-4xl font-bold tracking-[-0.03em] sm:text-5xl md:text-6xl">
            Stories from the event revolution.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-slate-300 md:text-lg">
            Product updates, event tips, community stories, and insights from the
            team building the future of events.
          </p>
        </div>
      </section>

      {/* Category filter */}
      {categories.length > 1 && (
        <section className="px-6 pb-12">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2.5">
            {categories.map((cat) => {
              const active = cat === selected;
              return (
                <Link
                  key={cat}
                  href={cat === "all" ? "/blog" : `/blog?category=${encodeURIComponent(cat)}`}
                  className={
                    active
                      ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-[#050507]"
                      : "rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition-colors duration-200 hover:border-white/20 hover:text-white"
                  }
                >
                  {cat === "all" ? "All" : cat}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {posts.length === 0 ? (
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
            <h2 className="text-xl font-semibold text-white">No posts yet</h2>
            <p className="mt-2 text-slate-400">
              Check back soon for stories and updates from the team.
            </p>
          </div>
        </section>
      ) : (
        <>
          {featuredPost && (
            <section className="px-6 pb-12">
              <div className="mx-auto max-w-6xl">
                <FeaturedCard post={featuredPost} />
              </div>
            </section>
          )}

          <section className="border-t border-white/5 px-6 py-14">
            <div className="mx-auto max-w-6xl">
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">
                Latest posts
              </h2>
              <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regularPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Newsletter */}
      <section className="border-t border-white/5 px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center md:p-12">
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-white md:text-3xl">
              Never miss an update
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-300 md:text-base">
              Subscribe for the latest product updates, event tips, and community
              stories.
            </p>
            <form className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 sm:flex-row">
              <input
                type="email"
                placeholder="your@email.com"
                required
                aria-label="Email address"
                className="w-full rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white placeholder-slate-500 outline-none transition-colors duration-200 hover:border-white/20 focus:border-primary sm:flex-1"
              />
              <button
                type="submit"
                className="w-full whitespace-nowrap rounded-full bg-primary px-7 py-3 text-sm font-semibold text-[#050507] transition-colors duration-200 hover:bg-[#1f83ff] sm:w-auto"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
