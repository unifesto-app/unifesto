"use client";

import { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  MagnifyingGlass,
  SlidersHorizontal,
  X,
  CalendarBlank,
  MapPin,
  ArrowRight,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EventCardSkeleton from "@/components/EventCardSkeleton";
import EmptyState from "@/components/EmptyState";
import {
  getEvents,
  filterEvents,
  ALL_CATEGORIES,
  STATUS_TABS,
  DATE_FILTERS,
  PRICE_FILTERS,
  type Event,
} from "@/lib/api/events";
import PageHero from "@/components/site/PageHero";

type PriceKey = "all" | "free" | "paid";
type DateKey = "all" | "today" | "week" | "upcoming";

const CURRENCY = "\u20b9";

function formatFeatureDate(iso?: string): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBA";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── Featured strip card ──────────────────────────────────────────────
   A wider, horizontal card that reads differently from the uniform grid,
   so the top of the page has a clear focal rhythm instead of an identical
   card wall. Reuses the same clickable-article pattern as EventCard. */
function FeatureCard({ event }: { event: Event }) {
  const router = useRouter();
  const space = event.space ?? event.organization;
  const organizer = space?.name || "Organizer";
  const image = event.banner_url || event.thumbnail_url || event.image_url;
  const href = `/event/${event.slug || event.id}`;
  const location =
    event.event_type === "online"
      ? "Online"
      : event.venue || event.city || event.state || "Venue TBA";
  // Ticket-derived (see mapEvent): `price` is the cheapest PAID tier, so a mixed
  // free+paid event reads "From ₹X" with a free-tickets note, never "Free".
  const isFree = event.is_free || !event.price;
  const hasMultipleTiers = (event.ticket_type_count ?? 0) > 1;
  const amount = `${CURRENCY}${(event.price ?? 0).toLocaleString("en-IN")}`;
  const price = isFree ? "Free" : hasMultipleTiers ? `From ${amount}` : amount;
  const freeAvailable = !isFree && !!event.has_free_tickets;

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`${event.title} by ${organizer}`}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="group relative flex h-full w-[300px] flex-shrink-0 cursor-pointer flex-col overflow-hidden rounded-3xl bg-night-2 transition-colors duration-150 hover:bg-night-3 sm:w-[360px]"
    >
      <div className="relative h-44 overflow-hidden bg-night-3">
        {image && (
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center transition-transform duration-[600ms] ease-[cubic-bezier(.19,1,.22,1)] group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${image})` }}
          />
        )}
        <div
          aria-hidden
          className={
            image
              ? "absolute inset-0 bg-gradient-to-t from-scrim via-scrim/30 to-transparent"
              : "absolute inset-0 bg-[radial-gradient(120%_120%_at_80%_0%,rgb(var(--glow)/0.22),transparent_60%)]"
          }
        />
        <span className="absolute left-4 top-4 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-ink">
          {event.is_trending ? "Trending" : "Featured"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-6">
        <h3 className="text-lg font-bold leading-snug text-paper line-clamp-2">{event.title}</h3>
        <p className="truncate text-xs font-medium text-paper/60">{organizer}</p>
        <div className="mt-1 flex flex-col gap-1.5 text-xs text-paper/65">
          <span className="flex items-center gap-1.5">
            <CalendarBlank className="h-3.5 w-3.5 flex-shrink-0 text-primary/80" aria-hidden="true" />
            {formatFeatureDate(event.start_date)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary/80" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="flex flex-col">
            <span className="text-sm font-bold text-white">{price}</span>
            {freeAvailable && (
              <span className="text-[10px] font-medium text-primary">Free tickets available</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            View
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  );
}

/* Reusable labelled pill group inside the filter panel. */
function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-paper/60">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              aria-pressed={active}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
                active ? "bg-primary text-ink" : "bg-paper/[0.06] text-paper/75 hover:bg-paper/[0.1] hover:text-paper"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventsContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(searchParams.get("category") ?? "All");
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");
  const [price, setPrice] = useState<PriceKey>("all");
  const [dateRange, setDateRange] = useState<DateKey>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const itemsPerPage = 12;
  const gridTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      try {
        const filters: Record<string, unknown> = {};
        if (category !== "All") filters.category = category;
        if (price === "free") filters.is_free = true;
        if (price === "paid") filters.is_free = false;

        const response = await getEvents(1, 100, filters);
        setAllEvents(response.events);
      } catch (error) {
        console.error("Error loading events:", error);
        setAllEvents([]);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [category, price]);

  const filteredEvents = useMemo(
    () => filterEvents(allEvents, { query, category, status, price, dateRange }),
    [allEvents, query, category, status, price, dateRange]
  );

  // Featured strip: only surfaced on the neutral view (no active filters), so
  // it never contradicts what the user is actively searching for.
  const featuredEvents = useMemo(
    () => allEvents.filter((e) => e.is_featured || e.is_trending).slice(0, 8),
    [allEvents]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [query, category, status, price, dateRange]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const events = filteredEvents.slice(startIndex, endIndex);

  const clearAll = () => {
    setQuery("");
    setCategory("All");
    setStatus("all");
    setPrice("all");
    setDateRange("all");
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
    gridTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hasFilters =
    Boolean(query) ||
    category !== "All" ||
    status !== "all" ||
    price !== "all" ||
    dateRange !== "all";

  const activeStatusLabel = STATUS_TABS.find((t) => t.key === status)?.label;
  const activeDateLabel = DATE_FILTERS.find((f) => f.key === dateRange)?.label;
  const activePriceLabel = PRICE_FILTERS.find((f) => f.key === price)?.label;

  // Active-filter chips: each dismissible, so the applied state is legible and
  // reversible without hunting through a pill wall.
  const chips: { label: string; onClear: () => void }[] = [];
  if (query) chips.push({ label: `"${query}"`, onClear: () => setQuery("") });
  if (category !== "All") chips.push({ label: category, onClear: () => setCategory("All") });
  if (status !== "all" && activeStatusLabel)
    chips.push({ label: activeStatusLabel, onClear: () => setStatus("all") });
  if (dateRange !== "all" && activeDateLabel)
    chips.push({ label: activeDateLabel, onClear: () => setDateRange("all") });
  if (price !== "all" && activePriceLabel)
    chips.push({ label: activePriceLabel, onClear: () => setPrice("all") });

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />

      <PageHero
        lines={["Find something", "worth your evening."]}
        accentFrom={1}
        size="md"
        lede="Hackathons, workshops, fests and talks at Malla Reddy University. Register in seconds."
      />
      {/* Same gap below the hero's horizon line as above it */}
      <div className="h-14 md:h-20" aria-hidden />

      {/* Featured strip: only on the clean view so it never fights the filters */}
      {!hasFilters && (featuredEvents.length > 0 || loading) && (
        <section className="px-5 pb-6 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-paper">Featured and trending</h2>
            </div>
            <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden" data-stagger="rise">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="w-[300px] flex-shrink-0 sm:w-[360px]">
                      <EventCardSkeleton />
                    </div>
                  ))
                : featuredEvents.map((e) => <FeatureCard key={e.id} event={e} />)}
            </div>
          </div>
        </section>
      )}

      {/* Sticky command bar: search + status + filter toggle stay in reach */}
      <div className="blur-bg sticky top-16 z-30 md:top-[4.5rem]">
        <div className="mx-auto max-w-7xl px-5 py-3 sm:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            {/* Search */}
            <div className="relative flex-1 md:max-w-sm">
              <MagnifyingGlass
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/50"
                aria-hidden="true"
              />
              <input
                id="events-page-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events, organizers…"
                aria-label="Search events"
                className="w-full rounded-full bg-paper/[0.07] py-2.5 pl-11 pr-4 text-sm text-paper placeholder:text-paper/50 outline-none transition-colors duration-150 focus:bg-paper/[0.11]"
              />
            </div>

            {/* Status segmented control */}
            <div
              role="tablist"
              aria-label="Event status"
              className="flex items-center gap-1 overflow-x-auto rounded-full bg-paper/[0.06] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {STATUS_TABS.map((tab) => {
                const active = status === tab.key;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatus(tab.key)}
                    className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                      active ? "bg-primary text-ink" : "text-paper/65 hover:text-paper"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className={`btn btn-sm md:ml-auto ${
                filtersOpen || category !== "All" || dateRange !== "all" || price !== "all" ? "btn-primary" : "btn-secondary"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters
            </button>
          </div>

          {/* Expandable filter panel */}
          {filtersOpen && (
            <div className="animate-pop-in mt-3 grid origin-top gap-5 rounded-3xl bg-night-2 p-6 sm:grid-cols-3">
              <FilterGroup
                label="Category"
                options={ALL_CATEGORIES.map((c) => ({ key: c, label: c }))}
                value={category}
                onChange={setCategory}
              />
              <FilterGroup
                label="Date"
                options={DATE_FILTERS}
                value={dateRange}
                onChange={(v) => setDateRange(v as DateKey)}
              />
              <FilterGroup
                label="Price"
                options={PRICE_FILTERS}
                value={price}
                onChange={(v) => setPrice(v as PriceKey)}
              />
            </div>
          )}

          {/* Active-filter chips */}
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {chips.map((chip, i) => (
                <button
                  key={`${chip.label}-${i}`}
                  onClick={chip.onClear}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 py-1 pl-3 pr-2 text-xs font-medium text-paper transition-colors duration-150 hover:bg-primary/25"
                >
                  {chip.label}
                  <X className="h-3 w-3" aria-hidden="true" />
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
              <button
                onClick={clearAll}
                className="link-draw text-xs font-medium text-paper/60 transition-colors duration-150 hover:text-paper"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div ref={gridTopRef} className="mx-auto max-w-7xl scroll-mt-40 px-5 py-10 sm:px-8">
        <p className="mb-6 text-sm text-paper/60" aria-live="polite">
          {loading
            ? "Loading events…"
            : filteredEvents.length === 0
            ? "No events"
            : `${filteredEvents.length} event${filteredEvents.length !== 1 ? "s" : ""}`}
          {!loading && (hasFilters ? " matching your filters" : " total")}
          {!loading && totalPages > 1 && ` \u2022 page ${currentPage} of ${totalPages}`}
        </p>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" data-stagger="rise">
            {events.map((event, i) => (
              <EventCard key={event.id} event={event} index={startIndex + i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1">
            <EmptyState
              onClear={clearAll}
              onCategory={(cat) => {
                setQuery("");
                setStatus("all");
                setPrice("all");
                setDateRange("all");
                setCategory(cat);
              }}
            />
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <nav
            aria-label="Pagination"
            className="mt-14 flex items-center justify-center gap-2"
          >
            <button
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="btn btn-sm btn-secondary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <CaretLeft className="h-4 w-4" aria-hidden="true" />
              Prev
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                const showPage =
                  page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                const showEllipsis =
                  (page === 2 && currentPage > 3) ||
                  (page === totalPages - 1 && currentPage < totalPages - 2);

                if (showEllipsis)
                  return (
                    <span key={page} className="px-2 text-paper/50">
                      …
                    </span>
                  );
                if (!showPage) return null;

                const active = currentPage === page;
                return (
                  <button
                    key={page}
                    onClick={() => goToPage(page)}
                    aria-current={active ? "page" : undefined}
                    className={`tabular h-10 w-10 rounded-full text-sm font-medium transition-colors duration-150 ${
                      active ? "bg-primary text-ink" : "text-paper/70 hover:bg-paper/[0.07]"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="btn btn-sm btn-secondary disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next
              <CaretRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>

      <Footer />
    </main>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <EventsContent />
    </Suspense>
  );
}
