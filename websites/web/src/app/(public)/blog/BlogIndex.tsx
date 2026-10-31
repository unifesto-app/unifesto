"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Section from "@/components/site/Section";
import ShadeCard, { SHADES } from "@/components/site/ShadeCard";

/* /blog is prerendered once for everyone (lib/cached-pages.ts), so ?category=
   is applied here, in the browser. The cards are rendered on the server. */

export type PostRow = { id: string; category: string; featured: boolean; featuredCard: ReactNode; card: ReactNode };

const noop = () => () => {};

/* "all" in every server render and during hydration, the URL's category after.
   A background re-render of the prerendered page sees the query of the request
   that triggered it, and would bake one visitor's filter into everyone's HTML. */
function useCategory() {
  const category = useSearchParams().get("category") ?? "all";
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? category : "all";
}

export function CategoryPills({ categories }: { categories: string[] }) {
  const selected = useCategory();
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => {
        const active = cat === selected;
        return (
          <Link
            key={cat}
            href={cat === "all" ? "/blog" : `/blog?category=${encodeURIComponent(cat)}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
              active ? "bg-primary text-ink" : "bg-paper/[0.06] text-paper/75 hover:bg-paper/[0.1] hover:text-paper"
            }`}
          >
            {cat === "all" ? "All" : cat}
          </Link>
        );
      })}
    </div>
  );
}

export function Posts({ rows }: { rows: PostRow[] }) {
  const selected = useCategory();
  const posts = selected === "all" ? rows : rows.filter((p) => p.category === selected);
  const featured = posts.find((p) => p.featured);
  const regular = posts.filter((p) => p !== featured);

  if (!posts.length) {
    return (
      <Section surface="night" pad="tight">
        <div className="rounded-3xl bg-night-2 p-12 text-center">
          <h2 className="text-xl font-semibold text-paper">No posts yet</h2>
          <p className="mt-2 text-paper/65">Check back soon for stories and updates from the team.</p>
        </div>
      </Section>
    );
  }
  return (
    <>
      {featured && (
        <Section surface="night" pad="tight">
          <div data-reveal="scale">
            <ShadeCard shade="blue" glass className="p-3" glassClassName="w-full">
              {featured.featuredCard}
            </ShadeCard>
          </div>
        </Section>
      )}
      {regular.length > 0 && (
        <Section surface="paper">
          <h2
            data-reveal="clip"
            className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-bold text-ink"
            style={{ letterSpacing: "-0.03em" }}
          >
            Latest posts
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-stagger="rise">
            {regular.map((p, i) => (
              <ShadeCard key={p.id} shade={SHADES[i % SHADES.length]} glass className="p-3" glassClassName="h-full">
                {p.card}
              </ShadeCard>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
