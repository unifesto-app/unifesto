"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CaretRight } from "@unifesto/unicon/react";
import { getEventById } from "@/lib/api/events-api";
import type { Event } from "@/lib/api/events-api";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

/**
 * Event-scoped chrome. The event's SECTION nav lives in the shared left rail
 * (the dashboard layout swaps in `EventNav` for these routes), so this layout
 * only owns the in-content header: a breadcrumb back to Events, the event
 * title, and its status. Content renders full width beneath.
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

  const loadEvent = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getEventById(eventId);
    if (error || !data) {
      router.push(`/dashboard/events`);
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
      {/* Breadcrumb + event identity */}
      <div className="space-y-2">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link
            href="/dashboard/events"
            className="transition-colors hover:text-foreground"
          >
            Events
          </Link>
          <CaretRight className="h-3.5 w-3.5" weight="bold" />
          <span className="line-clamp-1 font-medium text-foreground">
            {event.title}
          </span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{event.title}</h1>
          <Badge variant={statusColor} className="text-xs">
            {event.status}
          </Badge>
        </div>
      </div>

      {/* Section content — full width; section nav lives in the shared rail */}
      <div>{children}</div>
    </div>
  );
}
