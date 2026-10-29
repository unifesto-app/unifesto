"use client";

import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getEventById } from "@/console/lib/api/events-api";
import type { Event } from "@/console/lib/api/events-api";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Badge } from "@/console/components/ui/badge";
import { EventLayoutContext } from "@/console/components/events/EventLayoutContext";
import { useCrumbName } from "@/console/components/shell/Breadcrumbs";

/**
 * Event-scoped chrome. The event's SECTION nav lives in the shared left rail
 * (the dashboard layout swaps in `EventNav` for these routes), so this layout
 * only owns the in-content header: the event title and its status (the
 * header's breadcrumbs lead back). Content renders full width beneath.
 */
export default function EventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const spaceId = useSpaceId();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  // The header's breadcrumbs show this event by name.
  useCrumbName(`/console/events/${eventId}`, event?.title);

  const loadEvent = useCallback(async () => {
    const { data, error } = await getEventById(eventId);
    if (error || !data) {
      router.push(`/console/events`);
      return;
    }
    setEvent(data);
    setLoading(false);
  }, [eventId, router, spaceId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  if (loading || !event) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-72" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const statusColor = {
    DRAFT: "neutral",
    PUBLISHED: "success",
    ONGOING: "success",
    COMPLETED: "neutral",
    CANCELLED: "destructive",
  }[event.status] as "neutral" | "success" | "destructive";

  return (
    <div className="space-y-6">
      {/* Event identity; the header's breadcrumbs carry the way back. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Not an h1: each page's own PageHeader is the page's one h1 (B12). */}
          <p className="text-xl font-semibold text-foreground">{event.title}</p>
          <Badge variant={statusColor} className="text-xs">
            {event.status}
          </Badge>
        </div>
      </div>

      {/* Section content — full width; section nav lives in the shared rail */}
      <EventLayoutContext.Provider value={{ event, reload: loadEvent }}>
        <div>{children}</div>
      </EventLayoutContext.Provider>
    </div>
  );
}
