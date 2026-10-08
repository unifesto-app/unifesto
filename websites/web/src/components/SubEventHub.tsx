"use client";

import Link from "next/link";
import { CalendarBlank, MapPin, ArrowRight, Stack } from "@unifesto/unicon/react";
import type { SubEventSummary } from "@/lib/api/events";

/* Turn an ISO date into "Mar 16, 2026" without ever risking an Invalid Date. */
function formatDate(iso?: string): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBA";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Upcoming and live sub-events first (soonest first), finished ones after. */
function orderSubEvents(subs: SubEventSummary[]): SubEventSummary[] {
  const done = (s: SubEventSummary) => (s.status === "COMPLETED" ? 1 : 0);
  return [...subs].sort((a, b) => done(a) - done(b) || a.start_date.localeCompare(b.start_date));
}

function priceLabel(sub: SubEventSummary): string {
  if (sub.status === "COMPLETED") return "Ended";
  if (sub.is_free || sub.price === 0) return "Free";
  if (typeof sub.price === "number") {
    const currency = sub.currency === "USD" ? "$" : "₹";
    return `From ${currency}${sub.price}`;
  }
  return "";
}

/**
 * The sub-event hub shown on a "big event" (parent) page: a responsive grid of
 * cards, one per published sub-event, each linking through to its own page.
 * Rendered only when the event actually has sub-events.
 */
export function SubEventHub({
  subEvents,
  mode = "umbrella",
}: {
  subEvents: SubEventSummary[];
  /** "pass" = parent sells its own ticket; "umbrella" = register per sub-event. */
  mode?: "pass" | "umbrella";
}) {
  if (!subEvents?.length) return null;

  return (
    <section>
      <div className="mb-5 flex items-center gap-2">
        <Stack className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-bold text-white">
          Sub-events
          <span className="ml-2 text-sm font-medium text-paper/65">
            {subEvents.length}
          </span>
        </h2>
      </div>
      <p className="mb-5 text-sm text-paper/65">
        {mode === "pass"
          ? "Your event pass covers the overall event. Each sub-event below has its own schedule — some may need separate registration."
          : "This is a multi-part event. Each sub-event below has its own schedule and registration — pick the ones you want to attend."}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {orderSubEvents(subEvents).map((sub) => (
          <Link
            key={sub.id}
            href={`/event/${sub.slug}`}
            className="group flex flex-col overflow-hidden rounded-3xl bg-night-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {sub.banner_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sub.banner_url}
                alt=""
                className="aspect-[16/9] w-full object-cover"
              />
            ) : (
              <div className="aspect-[16/9] w-full bg-gradient-to-br from-primary/20 to-night-3" />
            )}

            <div className="flex flex-1 flex-col p-4">
              <h3 className="mb-2 line-clamp-2 text-base font-bold text-white group-hover:text-primary">
                {sub.title}
              </h3>

              <div className="mt-auto space-y-1.5 text-xs text-paper/65">
                <span className="flex items-center gap-1.5">
                  <CalendarBlank className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  {formatDate(sub.start_date)}
                </span>
                {(sub.venue || sub.city) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {[sub.venue, sub.city].filter(Boolean).join(", ")}
                  </span>
                )}
                {(sub.sub_event_count ?? 0) > 0 && (
                  <span className="flex items-center gap-1.5 text-primary">
                    <Stack className="h-3.5 w-3.5" aria-hidden="true" />
                    {sub.sub_event_count === 1
                      ? "1 sub-event inside"
                      : `${sub.sub_event_count} sub-events inside`}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {priceLabel(sub)}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  View <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * A breadcrumb chip linking a sub-event back up to its parent "big event".
 * Rendered in the hero of a sub-event's page.
 */
export function ParentEventChip({ parent }: { parent: SubEventSummary }) {
  return (
    <Link
      href={`/event/${parent.slug}`}
      className="inline-flex items-center gap-2 rounded-full bg-paper/[0.08] px-3 py-1.5 text-xs font-semibold text-paper/90 backdrop-blur-sm transition-colors hover:text-white"
    >
      <Stack className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      Part of {parent.title}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}
