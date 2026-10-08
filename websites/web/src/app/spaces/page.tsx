"use client";

import { optimized } from "@/lib/img";
import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { MagnifyingGlass, Buildings, UsersThree, CaretRight, ArrowRight } from "@unifesto/unicon/react";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getSpaces, type Space } from "@/lib/api/spaces";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* ── Space avatar (logo or initials) ──────────────────────────────────── */

function SpaceAvatar({ space, size = "md" }: { space: Space; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-10 w-10 text-xs" : "h-12 w-12 text-base";
  const radius = size === "lg" ? "rounded-2xl" : "rounded-xl";

  if (space.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={space.logo_url}
        alt=""
        className={`${dims} ${radius} shrink-0 object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${dims} ${radius} grid shrink-0 place-items-center bg-primary font-extrabold text-ink`}
    >
      {initials(space.name)}
    </div>
  );
}

/* ── Verified check ───────────────────────────────────────────────────── */

function VerifiedMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0 text-primary`} viewBox="0 0 24 24" fill="currentColor" aria-label="Verified">
      <path d="M12 2 9.6 4.6 6 4l-.6 3.6L2 9.6 4.6 12 2 14.4 5.4 16 6 20l3.6-.6L12 22l2.4-2.6L18 20l.6-3.6L22 14.4 19.4 12 22 9.6 18.4 8 18 4l-3.6.6L12 2Zm-1.2 13.4-3.2-3.2 1.4-1.4 1.8 1.8 4-4 1.4 1.4-5.4 5.4Z" />
    </svg>
  );
}

/* ── Unified space card — one treatment for every space ───────────────── */

function SpaceCard({ space, childCount }: { space: Space; childCount: number }) {
  const members = space.member_count ?? 0;

  return (
    <Link
      href={`/space/${space.slug || space.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-night-2 transition-colors duration-150 hover:bg-night-3"
    >
      {/* Banner with overlaid identity */}
      <div className="relative aspect-[4/3] overflow-hidden bg-night-3">
        {space.banner_url && (
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center transition-transform duration-[600ms] ease-[cubic-bezier(.19,1,.22,1)] group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${optimized(space.banner_url, 750)})` }}
          />
        )}
        <div
          aria-hidden
          className={
            space.banner_url
              ? "absolute inset-0 bg-gradient-to-t from-night-2 via-night-2/60 to-scrim/10"
              : "absolute inset-0 bg-[radial-gradient(120%_140%_at_85%_-10%,rgb(var(--glow)/0.28),transparent_58%)]"
          }
        />

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-6">
          <SpaceAvatar space={space} size="lg" />
          <div className="min-w-0 pb-0.5">
            <h3 className="flex items-center gap-1.5 text-lg font-extrabold leading-snug text-paper drop-shadow-sm">
              <span className="truncate">{space.name}</span>
              {space.is_verified && <VerifiedMark />}
            </h3>
            {(space.city || space.state) && (
              <p className="mt-0.5 truncate text-xs text-paper/70">
                {[space.city, space.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-6">
        {space.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-paper/65">{space.description}</p>
        )}

        <div className="mt-auto flex items-center gap-4 pt-3 text-xs text-paper/75">
          {members > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <UsersThree className="h-4 w-4 text-primary/80" aria-hidden />
              {members.toLocaleString()} <span className="text-paper/50">members</span>
            </span>
          )}
          {childCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Buildings className="h-4 w-4 text-primary/80" aria-hidden />
              {childCount} <span className="text-paper/50">sub-space{childCount !== 1 ? "s" : ""}</span>
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-primary">
            View
            <CaretRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────────── */

function SpacesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-3xl bg-night-2">
          <div className="relative aspect-[4/3] animate-pulse bg-paper/[0.04]">
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-6">
              <div className="h-16 w-16 animate-pulse rounded-2xl bg-paper/[0.08]" />
              <div className="mb-1 h-4 w-2/3 animate-pulse rounded bg-paper/[0.08]" />
            </div>
          </div>
          <div className="space-y-3 p-5">
            <div className="h-3 w-full animate-pulse rounded bg-paper/[0.05]" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-paper/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

const ITEMS_PER_PAGE = 12;

function SpacesContent() {
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [allSpaces, setAllSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSpaces = async () => {
      setLoading(true);
      try {
        const response = await getSpaces(1, 100, { is_active: true });
        setAllSpaces(response.spaces);
      } catch (error) {
        console.error("Error loading spaces:", error);
        setAllSpaces([]);
      } finally {
        setLoading(false);
      }
    };
    loadSpaces();
  }, []);

  // Child counts per parent id, computed once — shown as a badge on each card.
  const childCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of allSpaces) {
      if (s.parent_space_id) map.set(s.parent_space_id, (map.get(s.parent_space_id) ?? 0) + 1);
    }
    return map;
  }, [allSpaces]);

  // Spaces and sub-spaces live in the same flat grid — no hierarchy partitions.
  const filtered = useMemo(() => {
    const lc = query.trim().toLowerCase();
    if (!lc) return allSpaces;
    return allSpaces.filter(
      (s) => s.name.toLowerCase().includes(lc) || s.description?.toLowerCase().includes(lc)
    );
  }, [allSpaces, query]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />

      <PageHero
        lines={["The organisers behind", "every event."]}
        accentFrom={1}
        size="md"
        lede="Universities, clubs and communities, each running its events from its own Space."
        actions={
          <div className="relative w-full sm:w-96">
            <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/50" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search spaces…"
              aria-label="Search spaces"
              className="w-full rounded-full bg-paper/[0.07] py-3 pl-11 pr-4 text-sm text-paper placeholder:text-paper/50 outline-none transition-colors duration-150 focus:bg-paper/[0.11]"
            />
          </div>
        }
      />

      <div className="mx-auto max-w-7xl px-5 pb-24 pt-14 sm:px-8 md:pt-20">
        {loading ? (
          <SpacesSkeleton />
        ) : filtered.length === 0 ? (
          <div className="animate-pop-in flex flex-col items-center gap-4 rounded-3xl bg-night-2 px-6 py-20 text-center">
            <Buildings className="h-10 w-10 text-primary" weight="bold" aria-hidden />
            <div>
              <p className="text-lg font-bold text-paper">No spaces found</p>
              <p className="mt-1 max-w-xs text-sm text-paper/60">
                {query ? "Try a different search." : "No active spaces to show right now."}
              </p>
            </div>
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="btn btn-sm btn-primary"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-paper/60">
              {filtered.length} space{filtered.length !== 1 ? "s" : ""}
              {totalPages > 1 && ` · page ${page} of ${totalPages}`}
            </p>

            {/* One uniform grid for spaces and sub-spaces alike */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" data-stagger="rise">
              {paginated.map((space) => (
                <div key={space.id}>
                  <SpaceCard space={space} childCount={childCounts.get(space.id) ?? 0} />
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <nav
                aria-label="Pagination"
                className="mt-14 flex items-center justify-center gap-2"
              >
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-sm btn-secondary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    const show = p === 1 || p === totalPages || Math.abs(p - page) <= 1;
                    const ellipsis =
                      (p === 2 && page > 3) || (p === totalPages - 1 && page < totalPages - 2);
                    if (ellipsis) return <span key={p} className="px-2 text-paper/50">…</span>;
                    if (!show) return null;
                    const active = page === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        aria-current={active ? "page" : undefined}
                        className={`tabular h-10 w-10 rounded-full text-sm font-medium transition-colors duration-150 ${
                          active ? "bg-primary text-ink" : "text-paper/70 hover:bg-paper/[0.07]"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-sm btn-secondary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      <Section surface="paper" width="text" innerClassName="text-center">
        <h2
          data-reveal="clip"
          className="font-display text-[clamp(1.75rem,3.8vw,2.6rem)] font-bold leading-[1.04] text-ink [text-wrap:balance]"
          style={{ letterSpacing: "-0.035em" }}
        >
          Run your own Space.
        </h2>
        <p data-reveal="blur" className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-ink/70">
          Your club, cell or community, with its team, its events and its money in one place.
        </p>
        <div data-reveal="rise" className="mt-9 flex justify-center">
          <Link href="/request-space" className="btn btn-lg btn-primary">
            Request a Space
            <ArrowRight className="btn-arrow h-4 w-4" weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </Section>

      <Footer />
    </main>
  );
}

export default function SpacesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <SpacesContent />
    </Suspense>
  );
}
