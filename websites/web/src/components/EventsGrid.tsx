"use client";

import { useState, useMemo, useEffect } from "react";
import { MagnifyingGlass, ArrowRight } from "@unifesto/unicon/react";
import EventCard from "./EventCard";
import { getListedEvents, filterEvents, type Event } from "@/lib/api/events";

export default function EventsGrid() {
  const [query, setQuery] = useState("");
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getListedEvents()
      .then((events) => {
        if (active) setAllEvents(events);
      })
      .catch(() => {
        if (active) setAllEvents([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Detect device location → reverse-geocode to a city name (mirrors mobile app)
  useEffect(() => {
    let active = true;

    // Check if geolocation is available
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    // Check if we're in a secure context (HTTPS or localhost)
    // Most modern browsers require secure context for geolocation
    if (typeof window !== "undefined" && !window.isSecureContext) {
      console.warn("Geolocation requires a secure context (HTTPS)");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await res.json();
          const detected: string | null =
            data?.city || data?.locality || data?.principalSubdivision || null;
          if (active && detected) setCity(detected);
        } catch (error) {
          /* keep fallback heading */
          console.error("Error fetching location:", error);
        }
      },
      (error) => {
        /* permission denied or unavailable — keep fallback heading */
        // Silently handle - no need to log since it's an expected user action
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );

    return () => {
      active = false;
    };
  }, []);

  const events = useMemo(
    () => filterEvents(allEvents, { query }),
    [allEvents, query]
  );

  // Upcoming come first (see getListedEvents), so past events only fill the
  // preview when little is coming up; with nothing upcoming, say so honestly.
  const preview = events.slice(0, 6);
  // True while loading too, so the heading doesn't shift when events arrive.
  const showNext = useMemo(() => {
    const now = Date.now();
    return (
      allEvents.length === 0 ||
      allEvents.some((e) => new Date(e.end_date || e.start_date).getTime() >= now)
    );
  }, [allEvents]);

  return (
    <section id="events" aria-labelledby="events-heading" className="surface-night relative px-5 py-24 sm:px-8 md:py-32">

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Section header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 id="events-heading" data-reveal="clip" className="font-display text-[clamp(1.6rem,3.4vw,2.6rem)] leading-[1.12] text-paper">
              {showNext ? "What is on next" : "Recently on Unifesto"}{" "}
              {showNext && city && (
                <span className="mt-2 block font-sans text-lg font-light text-paper/55 md:text-xl">
                  in {city}
                </span>
              )}
            </h2>
          </div>
          <a
            href="/events"
            className="link-draw text-sm font-semibold text-primary transition-colors duration-150 hover:text-primary-bright group flex items-center gap-1 whitespace-nowrap"
          >
            View all events
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
        </div>

        {/* Quick search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlass
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="events-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Quick search..."
              className="w-full rounded-full border border-paper/12 bg-paper/[0.05] py-2.5 pl-10 pr-4 text-sm text-paper placeholder-paper/40 outline-none transition-colors duration-150 hover:border-paper/25 focus:border-primary"
            />
          </div>
        </div>

        {/* Events grid: show max 6 */}
        {preview.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6 lg:grid-cols-3" data-stagger="rise">
            {preview.map((event, index) => (
              <EventCard key={event.id} event={event} index={index} />
            ))}
          </div>
        ) : query ? (
          <div className="text-center py-16 border border-white/5 rounded-2xl">
            <p className="text-slate-400 text-sm">No events match your search.</p>
            <button
              onClick={() => setQuery("")}
              className="mt-3 text-xs font-medium text-primary transition-colors duration-150 hover:text-primary-bright"
            >
              Clear filters
            </button>
          </div>
        ) : null}

      </div>
    </section>
  );
}
