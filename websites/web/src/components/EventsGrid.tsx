"use client";

import { useState, useMemo, useEffect } from "react";
import { MagnifyingGlass, ArrowRight } from "@phosphor-icons/react";
import EventCard from "./EventCard";
import { getEvents, filterEvents, type Event } from "@/lib/api/events";

export default function EventsGrid() {
  const [query, setQuery] = useState("");
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getEvents(1, 100)
      .then((res) => {
        if (active) setAllEvents(res.events);
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

  const preview = events.slice(0, 6);

  return (
    <section id="events" aria-labelledby="events-heading" className="relative bg-canvas py-20 md:py-28 px-6">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 10%, rgba(52,145,255,0.06) 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Section header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 id="events-heading" className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
              Explore Events{" "}
              <span className="text-lg md:text-xl font-medium text-primary">
                {city ? `in ${city}` : "at Malla Reddy University"}
              </span>
            </h2>
          </div>
          <a
            href="/events"
            className="text-sm font-semibold text-primary hover:text-white transition-colors duration-200 group flex items-center gap-1 whitespace-nowrap"
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
              className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 outline-none hover:border-white/20 focus:border-[#3491ff] transition-colors duration-200"
            />
          </div>
        </div>

        {/* Events grid: show max 6 */}
        {preview.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {preview.map((event, index) => (
              <EventCard key={event.id} event={event} index={index} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border border-white/5 rounded-2xl">
            <p className="text-slate-400 text-sm">No events match your search.</p>
            <button
              onClick={() => setQuery("")}
              className="mt-3 text-xs font-medium text-primary transition-colors duration-200 hover:text-white"
            >
              Clear filters
            </button>
          </div>
        )}

      </div>
    </section>
  );
}
