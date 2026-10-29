"use client";

import Link from "next/link";
import { CalendarBlank, CaretRight } from "@unifesto/unicon/react";
import type { EventAccessEntry } from "@/console/lib/types/rbac";
import { Badge } from "@/console/components/ui/badge";

/**
 * Landing content for an event-only operator who can reach more than one event.
 * Space-level pages are off-limits to them, so instead of a space overview we
 * show a simple picker of the events they operate.
 */
export function EventAccessChooser({ events }: { events: EventAccessEntry[] }) {
  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Your events</h1>
        <p className="text-sm text-muted-foreground">
          Pick an event to manage.
        </p>
      </div>
      <div className="space-y-2">
        {events.map((ev) => (
          <Link
            key={ev.eventId}
            href={`/console/events/${ev.eventId}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-strong hover:bg-muted"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <CalendarBlank className="h-5 w-5" weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 font-medium text-foreground">
                {ev.title}
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="neutral" className="text-[10px]">
                  {ev.status}
                </Badge>
              </span>
            </span>
            <CaretRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
