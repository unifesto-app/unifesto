"use client";

import { optimized } from "@/lib/img";
import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  MagnifyingGlass,
  SlidersHorizontal,
  X,
  CalendarBlank,
  MapPin,
  ArrowRight,
  CaretLeft,
  CaretRight,
} from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EventCardSkeleton from "@/components/EventCardSkeleton";
import EmptyState from "@/components/EmptyState";
import {
  getListedEvents,
  filterEvents,
  browseFacets,
  trendingEvents,
  STATUS_TABS,
  DATE_FILTERS,
  PRICE_FILTERS,
  type Event,
} from "@/lib/api/events";
import PageHero from "@/components/site/PageHero";
import { IST } from "@/lib/site";
import { detectCity } from "@/lib/near-city";

type PriceKey = "all" | "free" | "paid";
type DateKey = "all" | "today" | "week" | "upcoming";

const CURRENCY = "\u20b9";

function formatFeatureDate(iso?: string): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBA";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: IST });
}

/* ── Featured strip card ──────────────────────────────────────────────
   A wider, horizontal card that reads differently from the uniform grid,
   so the top of the page has a clear focal rhythm instead of an identical
   card wall. Reuses the same clickable-article pattern as EventCard. */
function FeatureCard({ event }: { event: Event }) {
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
    <Link
      href={href}
      aria-label={`${event.title} by ${organizer}`}
      className="group relative flex h-full w-[300px] flex-shrink-0 flex-col overflow-hidden rounded-3xl bg-night-2 transition-colors duration-150 hover:bg-night-3 sm:w-[360px]"
    >
      <div className="relative h-44 overflow-hidden bg-night-3">
        {image && (
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center transition-transform duration-[600ms] ease-[cubic-bezier(.19,1,.22,1)] group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${optimized(image, 750)})` }}
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
        <div aria-hidden className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-scrim/55 to-transparent" />
        <span className="absolute left-4 top-4 text-[11px] font-semibold text-[#90d5ff] [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]">
          {event.registered_count ? `${event.registered_count.toLocaleString("en-IN")} going` : "Trending"}
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
    </Link>
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

/* A labelled dropdown inside the filter panel, for long option lists. */
function FilterSelect({
  label,
  all,
  options,
  value,
  onChange,
}: {
  label: string;
  all: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-paper/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full bg-paper/[0.06] px-4 py-2 text-xs font-medium text-paper outline-none [&>option]:bg-night-2"
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EventsContent({ initialEvents }: { initialEvents: Event[] | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  // K1: browse by city and by college or club (a space's slug); "" = all.
  const [city, setCity] = useState("");
  const [space, setSpace] = useState("");
  // The visitor's city, only when they already allowed location (never asks).
  const [nearCity, setNearCity] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [price, setPrice] = useState<PriceKey>("all");
  const [dateRange, setDateRange] = useState<DateKey>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [allEvents, setAllEvents] = useState<Event[]>(initialEvents ?? []);
  const [loading, setLoading] = useState(!initialEvents);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const itemsPerPage = 12;
  const gridTopRef = useRef<HTMLDivElement>(null);

  // Deep links (?category=, ?status=) are applied after mount. Reading them via
  // useSearchParams would make Next render the whole list client-side only,
  // which kept the grid out of the HTML and was the page's LCP.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("category");
    const st = params.get("status");
    // Post-mount on purpose: reading the URL during render would mismatch the
    // server HTML. One extra render, only on deep links.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (c) setCategory(c);
    if (st) setStatus(st);
    if (params.get("city")) setCity(params.get("city")!);
    if (params.get("space")) setSpace(params.get("space")!);
    detectCity({ prompt: false }).then(setNearCity);
  }, []);

  // The server sends every listed event (K1), so filters run here. Fetch only
  // when the server came back empty.
  useEffect(() => {
    if (initialEvents) return;
    getListedEvents()
      .then(setAllEvents, () => setAllEvents([]))
      .finally(() => setLoading(false));
  }, [initialEvents]);

  const filteredEvents = useMemo(
    () => filterEvents(allEvents, { query, category, city, space, status, price, dateRange }),
    [allEvents, query, category, city, space, status, price, dateRange]
  );

  const facets = useMemo(() => browseFacets(allEvents), [allEvents]);
  // "Trending near you": the chosen city, else where the visitor is.
  const trendCity = city || nearCity;
  const trending = useMemo(() => trendingEvents(allEvents, trendCity), [allEvents, trendCity]);
  const trendsLocal = !!trendCity && trending.some((e) => e.city?.trim().toLowerCase() === trendCity.toLowerCase());

  useEffect(() => {
    setCurrentPage(1);
  }, [query, category, city, space, status, price, dateRange]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const events = filteredEvents.slice(startIndex, endIndex);

  const clearAll = () => {
    setQuery("");
    setCategory("All");
    setCity("");
    setSpace("");
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
    Boolean(city) ||
    Boolean(space) ||
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
  if (city) chips.push({ label: `In ${city}`, onClear: () => setCity("") });
  if (space) chips.push({ label: facets.spaces.find((s) => s.key === space)?.name ?? space, onClear: () => setSpace("") });
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
        lede="Hackathons, workshops, fests and talks from campuses and communities. Register in seconds."
      />
      {/* Same gap below the hero's horizon line as above it */}
      <div className="h-14 md:h-20" aria-hidden />

      {/* K1: "Trending near you", busiest live and upcoming events, in the
          visitor's (or chosen) city first. Shown unless a filter other than
          the city is on, so it never fights a search.
          ponytail: it pops in above the grid once events load client-side
          (no placeholder, to avoid CLS); server-render it if that shows in CWV. */}
      {!loading && trending.length > 0 && !(hasFilters && !(city && chips.length === 1)) && (
        <section className="px-5 pb-6 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-paper">{trendsLocal ? `Trending in ${trendCity}` : "Trending now"}</h2>
            </div>
            <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden" data-stagger="rise">
              {trending.map((e) => <FeatureCard key={e.id} event={e} />)}
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
                filtersOpen || category !== "All" || city || space || dateRange !== "all" || price !== "all" ? "btn-primary" : "btn-secondary"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters
            </button>
          </div>

          {/* Expandable filter panel */}
          {filtersOpen && (
            <div className="animate-pop-in mt-3 grid origin-top gap-5 rounded-3xl bg-night-2 p-6 sm:grid-cols-3">
              <FilterSelect
                label="City"
                all="Every city"
                options={facets.cities.map((c) => ({ key: c.key, label: `${c.key} (${c.count})` }))}
                value={city}
                onChange={setCity}
              />
              <FilterSelect
                label="College or club"
                all="Every college and club"
                options={facets.spaces.map((s) => ({ key: s.key, label: `${s.name} (${s.count})` }))}
                value={space}
                onChange={setSpace}
              />
              <FilterGroup
                label="Category"
                options={[{ key: "All", label: "All" }, ...facets.categories.map((c) => ({ key: c.key, label: c.key }))]}
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
              suggestions={facets.categories.length ? facets.categories.slice(0, 4).map((c) => c.key) : undefined}
              onCategory={(cat) => {
                setQuery("");
                setStatus("all");
                setPrice("all");
                setDateRange("all");
                setCity("");
                setSpace("");
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

export default function EventsClient({ initialEvents }: { initialEvents: Event[] | null }) {
  return (
    <EventsContent initialEvents={initialEvents} />
  );
}
