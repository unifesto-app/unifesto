"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarBlank, MapPin, ArrowRight } from "@phosphor-icons/react";
import type { Event } from "@/lib/api/events";

interface EventCardProps {
  event: Event;
  index?: number;
}

/* Turn an ISO date into "Mar 16, 2026" without ever risking an Invalid Date. */
function formatEventDate(iso?: string): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBA";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* Format date range: "Mar 16 - 18, 2026" or "Mar 16 - Apr 2, 2026" */
function formatDateRange(startIso?: string, endIso?: string): string {
  if (!startIso) return "Date TBA";
  
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "Date TBA";
  
  // If no end date or same as start date, show single date
  if (!endIso) return formatEventDate(startIso);
  
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return formatEventDate(startIso);
  
  // Check if same day
  if (start.toDateString() === end.toDateString()) {
    return formatEventDate(startIso);
  }
  
  // Check if same month and year
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { day: "numeric", year: "numeric" })}`;
  }
  
  // Different months
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatEventTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getLocation(event: Event): string {
  if (event.event_type === "online") return "Online Event";
  return event.venue || event.city || event.state || "Venue TBA";
}

export default function EventCard({ event, index = 0 }: EventCardProps) {
  const router = useRouter();

  const space = event.space ?? event.organization;
  const isCompleted =
    event.status === "completed" || event.status === "cancelled";
  const isTrending = Boolean(event.is_trending);
  const isFeatured = Boolean(event.is_featured);

  const delayClass =
    ["", "animate-delay-100", "animate-delay-200", "animate-delay-300", "animate-delay-400"][
      index % 5
    ] ?? "";

  const formattedDate = formatDateRange(event.start_date, event.end_date);
  const formattedTime = formatEventTime(event.start_date);
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
    // Outer div: NOT an <a>, avoids nested <a> violation
    <div
      id={`event-card-${event.id}`}
      role="article"
      aria-label={`${event.title} by ${organizerName}`}
      onClick={() => router.push(eventHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(eventHref);
        }
      }}
      tabIndex={0}
      className={`animate-fade-in-up ${delayClass} group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3491ff] focus-visible:ring-offset-2 focus-visible:ring-offset-black`}
    >
      {/* Poster: real image when available, else dark field with the on-brand radial gradient. */}
      <div
        className="relative flex aspect-[4/3] items-end overflow-hidden bg-[#0a0a0d] p-5"
        style={
          imageUrl
            ? {
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div
          aria-hidden
          className={
            imageUrl
              ? "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
              : "pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_80%_0%,rgba(52,145,255,0.18),transparent_60%)]"
          }
        />

        {/* Category pill, bottom-left, matching the blog card kicker. */}
        <span className="relative z-10 rounded-full border border-primary/25 bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary">
          {event.category || "Event"}
        </span>

        {/* Status badges, top-right: restrained, brand-consistent. */}
        <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1.5">
          {isTrending && (
            <span className="rounded-full border border-white/25 bg-black/30 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              Trending
            </span>
          )}
          {isFeatured && (
            <span className="rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              Featured
            </span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-base font-bold leading-snug text-white line-clamp-2">
            {event.title}
          </h3>
          {spaceHref ? (
            <Link
              href={spaceHref}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 block truncate text-xs font-medium text-slate-400 transition-colors duration-200 hover:text-primary"
            >
              {organizerName}
            </Link>
          ) : (
            <span className="mt-1 block truncate text-xs font-medium text-slate-400">
              {organizerName}
            </span>
          )}
        </div>

        {/* Meta: higher contrast than before (slate-400, not slate-500/600). */}
        <div className="flex flex-col gap-1.5 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <CalendarBlank
              className="h-3.5 w-3.5 flex-shrink-0 text-primary/70"
              aria-hidden="true"
            />
            <span className="truncate">
              {formattedDate}
              {formattedTime ? ` \u00b7 ${formattedTime}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin
              className="h-3.5 w-3.5 flex-shrink-0 text-primary/70"
              aria-hidden="true"
            />
            <span className="truncate">{location}</span>
          </div>
        </div>

        {/* Footer: price + affordance (no gradient pill). */}
        <div className="mt-auto flex items-center justify-between border-t border-white/8 pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">{priceLabel}</span>
            {priceSubLabel && (
              <span className="text-[10px] font-medium text-green-400">
                {priceSubLabel}
              </span>
            )}
          </div>
          {isCompleted ? (
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-400">
              {event.status === "cancelled" ? "Cancelled" : "Completed"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-all duration-200 group-hover:gap-2">
              View
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
