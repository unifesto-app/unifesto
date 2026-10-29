"use client";

import { optimized } from "@/lib/img";
import Link from "next/link";
import { CalendarBlank, MapPin, ArrowRight } from "@unifesto/unicon/react";
import type { Event } from "@/lib/api/events";
import { IST } from "@/lib/site";

interface EventCardProps {
  event: Event;
  index?: number;
}

/* Turn an ISO date into "Mar 16, 2026" without ever risking an Invalid Date. */
function formatEventDate(iso: string | undefined, timeZone: string): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBA";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

/* Format date range: "Mar 16 - 18, 2026" or "Mar 16 - Apr 2, 2026" */
function formatDateRange(startIso: string | undefined, endIso: string | undefined, timeZone: string): string {
  if (!startIso) return "Date TBA";
  
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "Date TBA";
  
  // If no end date or same as start date, show single date
  if (!endIso) return formatEventDate(startIso, timeZone);
  
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return formatEventDate(startIso, timeZone);
  
  // Same day / month / year in the event's zone, not the machine's.
  const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone }).split("-");
  const [sy, sm, sd] = ymd(start);
  const [ey, em, ed] = ymd(end);
  if (sy === ey && sm === em && sd === ed) {
    return formatEventDate(startIso, timeZone);
  }
  
  // Check if same month and year
  if (sy === ey && sm === em) {
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })} - ${end.toLocaleDateString("en-US", { day: "numeric", year: "numeric", timeZone })}`;
  }
  
  // Different months
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone })}`;
}

function formatEventTime(iso: string | undefined, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

function getLocation(event: Event): string {
  if (event.event_type === "online") return "Online Event";
  return event.venue || event.city || event.state || "Venue TBA";
}

export default function EventCard({ event, index = 0 }: EventCardProps) {

  const space = event.space ?? event.organization;
  // The backend sends COMPLETED / CANCELLED; the mock data is lowercase.
  const status = event.status?.toLowerCase();
  const isCompleted = status === "completed" || status === "cancelled";
  const isTrending = Boolean(event.is_trending);
  const isFeatured = Boolean(event.is_featured);


  const tz = event.timezone || IST;
  const formattedDate = formatDateRange(event.start_date, event.end_date, tz);
  const formattedTime = formatEventTime(event.start_date, tz);
  const organizerName = space?.name || "Organizer";
  const location = getLocation(event);
  const currency =
    event.currency === "INR" || !event.currency ? "\u20b9" : event.currency;
  
  // Pricing logic
  const hasMultipleTickets = (event.ticket_type_count ?? 0) > 1;
  const hasFreeTickets = event.has_free_tickets ?? false;
  const isFree = event.is_free || !event.price;
  
  let priceLabel: string;
  let priceSubLabel: string | null = null;
  
  if (isFree && !hasMultipleTickets) {
    // All tickets are free
    priceLabel = "Free";
  } else if (hasMultipleTickets || event.ticket_type_count) {
    // Multiple ticket types - show "Starting from"
    if (isFree) {
      priceLabel = "Free";
    } else {
      priceLabel = `Starting from ${currency}${(event.price ?? 0).toLocaleString("en-IN")}`;
    }
    // If there are free tickets alongside paid ones
    if (hasFreeTickets && !isFree) {
      priceSubLabel = "Free Tickets Available";
    }
  } else {
    // Single ticket type or no ticket info
    priceLabel = isFree
      ? "Free"
      : `${currency}${(event.price ?? 0).toLocaleString("en-IN")}`;
  }

  const imageUrl = event.banner_url || event.thumbnail_url || event.image_url;
  const eventHref = `/event/${event.slug || event.id}`;
  const spaceHref =
    space?.slug || space?.id ? `/space/${space?.slug || space?.id}` : null;

  return (
    // K2: a real link for crawlers. The title's link stretches over the whole
    // card (::after), and the space link sits above it, so no nested <a>.
    <article
      id={`event-card-${event.id}`}
      aria-label={`${event.title} by ${organizerName}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-night-2 transition-colors duration-150 hover:bg-night-3"
    >
      {/* Poster: real image when available, else dark field with the on-brand radial gradient. */}
      <div className="relative flex aspect-[4/3] items-end overflow-hidden bg-night-3 p-5">
        {/* Poster layer zooms on hover (child moves, the card does not). */}
        {imageUrl && (
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center transition-transform duration-[600ms] ease-[cubic-bezier(.19,1,.22,1)] group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${optimized(imageUrl, 750)})` }}
          />
        )}
        <div
          aria-hidden
          className={
            imageUrl
              ? "pointer-events-none absolute inset-0 bg-gradient-to-t from-scrim/80 via-scrim/15 to-transparent"
              : "pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_80%_0%,rgb(var(--glow)/0.18),transparent_60%)]"
          }
        />

        {/* Category pill, bottom-left, matching the blog card kicker. */}
        <span className="blur-bg pointer-events-none relative z-10 rounded-full px-2.5 py-1 text-[11px] font-semibold text-paper">
          {event.category || "Event"}
        </span>

        {/* Status badges, top-right: restrained, brand-consistent. */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1.5">
          {isTrending && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-ink">
              Trending
            </span>
          )}
          {isFeatured && (
            <span className="blur-bg rounded-full px-2 py-0.5 text-[10px] font-semibold text-paper">
              Featured
            </span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div>
          <h3 className="text-base font-bold leading-snug text-paper line-clamp-2">
            <Link
              href={eventHref}
              className="after:absolute after:inset-0 after:z-[5] after:rounded-3xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
            >
              {event.title}
            </Link>
          </h3>
          {spaceHref ? (
            <Link
              href={spaceHref}
              className="relative z-10 mt-1 block truncate text-xs font-medium text-paper/60 transition-colors duration-150 hover:text-primary"
            >
              {organizerName}
            </Link>
          ) : (
            <span className="mt-1 block truncate text-xs font-medium text-paper/60">
              {organizerName}
            </span>
          )}
        </div>

        {/* Meta: higher contrast than before (slate-400, not slate-500/600). */}
        <div className="flex flex-col gap-1.5 text-xs text-paper/65">
          <div className="flex items-center gap-1.5">
            <CalendarBlank
              className="h-3.5 w-3.5 flex-shrink-0 text-primary/80"
              aria-hidden="true"
            />
            <span className="truncate">
              {formattedDate}
              {formattedTime ? ` \u00b7 ${formattedTime}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin
              className="h-3.5 w-3.5 flex-shrink-0 text-primary/80"
              aria-hidden="true"
            />
            <span className="truncate">{location}</span>
          </div>
        </div>

        {/* Footer: price + affordance (no gradient pill). */}
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-paper">{priceLabel}</span>
            {priceSubLabel && (
              <span className="text-[10px] font-medium text-primary">
                {priceSubLabel}
              </span>
            )}
          </div>
          {isCompleted ? (
            <span className="rounded-full bg-paper/[0.06] px-3 py-1.5 text-xs font-medium text-paper/60">
              {status === "cancelled" ? "Cancelled" : "Completed"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              View
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
