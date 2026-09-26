"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { MagnifyingGlass, Buildings, UsersThree, CaretRight } from "@phosphor-icons/react";
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
        className={`${dims} ${radius} shrink-0 object-cover ring-1 ring-white/10`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${dims} ${radius} grid shrink-0 place-items-center bg-primary/12 font-extrabold text-primary ring-1 ring-primary/20`}
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
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      {/* Banner with overlaid identity */}
      <div
        className="relative aspect-[4/3] overflow-hidden bg-[#0a0a0d]"
        style={
          space.banner_url
            ? { backgroundImage: `url(${space.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        <div
          aria-hidden
          className={
            space.banner_url
              ? "absolute inset-0 bg-gradient-to-t from-card via-card/70 to-black/20"
              : "absolute inset-0 bg-[radial-gradient(120%_140%_at_85%_-10%,rgba(52,145,255,0.28),transparent_58%)]"
          }
        />

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
          <SpaceAvatar space={space} size="lg" />
          <div className="min-w-0 pb-0.5">
            <h3 className="flex items-center gap-1.5 text-lg font-extrabold leading-snug text-white drop-shadow-sm">
              <span className="truncate">{space.name}</span>
              {space.is_verified && <VerifiedMark />}
            </h3>
            {(space.city || space.state) && (
              <p className="mt-0.5 truncate text-xs text-slate-300">
                {[space.city, space.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        {space.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-slate-400">{space.description}</p>
        )}

        <div className="mt-auto flex items-center gap-4 border-t border-white/8 pt-3 text-xs text-slate-300">
          {members > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <UsersThree className="h-4 w-4 text-primary/70" aria-hidden />
              {members.toLocaleString()} <span className="text-slate-500">members</span>
            </span>
          )}
          {childCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Buildings className="h-4 w-4 text-primary/70" aria-hidden />
              {childCount} <span className="text-slate-500">sub-space{childCount !== 1 ? "s" : ""}</span>
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-primary transition-all duration-200 group-hover:gap-1.5">
            View
            <CaretRight className="h-3.5 w-3.5" aria-hidden />
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
        <div key={i} className="overflow-hidden rounded-2xl border border-white/8 bg-card">
          <div className="relative aspect-[4/3] animate-pulse bg-white/[0.04]">
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
              <div className="h-16 w-16 animate-pulse rounded-2xl bg-white/[0.08]" />
              <div className="mb-1 h-4 w-2/3 animate-pulse rounded bg-white/[0.08]" />
            </div>
          </div>
          <div className="space-y-3 p-5">
            <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.04]" />
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

      {/* Header */}
      <section className="relative overflow-hidden border-b border-white/5 px-6 pb-8 pt-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 55% 70% at 50% -20%, rgba(52,145,255,0.10), transparent 70%)" }}
        />
        <div className="relative z-10 mx-auto max-w-6xl">
          <h1 className="text-balance text-4xl font-extrabold tracking-[-0.02em] text-white md:text-5xl">
            Spaces
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-slate-300">
            Universities, clubs, and communities — the organisers behind every event on Unifesto.
          </p>

          {/* Search */}
          <div className="relative mt-7 sm:max-w-sm">
            <MagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search spaces…"
              aria-label="Search spaces"
              className="w-full rounded-full border border-white/12 bg-white/[0.04] py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-400 outline-none transition-colors focus:border-primary focus:bg-white/[0.06]"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {loading ? (
          <SpacesSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <Buildings className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <div>
              <p className="text-lg font-bold text-white">No spaces found</p>
              <p className="mt-1 max-w-xs text-sm text-slate-400">
                {query ? "Try a different search." : "No active spaces to show right now."}
              </p>
            </div>
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-shadow duration-200 hover:shadow-[0_0_24px_rgba(52,145,255,0.4)]"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-slate-400">
              {filtered.length} space{filtered.length !== 1 ? "s" : ""}
              {totalPages > 1 && ` · page ${page} of ${totalPages}`}
            </p>

            {/* One uniform grid for spaces and sub-spaces alike */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {paginated.map((space, i) => (
                <div
                  key={space.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
                >
                  <SpaceCard space={space} childCount={childCounts.get(space.id) ?? 0} />
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <nav
                aria-label="Pagination"
                className="mt-10 flex items-center justify-center gap-2 border-t border-white/5 pt-8"
              >
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    const show = p === 1 || p === totalPages || Math.abs(p - page) <= 1;
                    const ellipsis =
                      (p === 2 && page > 3) || (p === totalPages - 1 && page < totalPages - 2);
                    if (ellipsis) return <span key={p} className="px-2 text-slate-500">…</span>;
                    if (!show) return null;
                    const active = page === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        aria-current={active ? "page" : undefined}
                        className={`h-10 w-10 rounded-lg text-sm font-medium transition-colors duration-200 ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "border border-white/12 text-slate-300 hover:bg-white/5"
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
                  className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>

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
