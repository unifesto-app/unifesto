"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarBlank } from "@unifesto/unicon/react";
import type { EventAccessEntry } from "@/console/lib/types/rbac";
import { cn } from "@/console/lib/utils/cn";
import { AssistInboxLink } from "./AssistInboxLink";
import { BackLink } from "./SpaceNav";

interface EventAccessNavProps {
  events: EventAccessEntry[];
  onNavigate?: () => void;
  collapsed?: boolean;
}

/**
 * Rail contents for an event-only operator (no space-level role). Lists just
 * the events they were added to; selecting one hands off to `EventNav`. They
 * never see space-level destinations.
 */
export function EventAccessNav({ events, onNavigate, collapsed = false }: EventAccessNavProps) {
  const pathname = usePathname();

  return (
    <div className={cn("flex min-h-full flex-col", collapsed ? "p-2" : "p-4")}>
      <BackLink href="/console/spaces" label="My Spaces" collapsed={collapsed} onNavigate={onNavigate} />
      <AssistInboxLink collapsed={collapsed} onNavigate={onNavigate} />
      {!collapsed && (
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          My events
        </p>
      )}
      <nav className="flex-1 space-y-0.5">
        {events.map((ev) => {
          const href = `/console/events/${ev.eventId}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={ev.eventId}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? ev.title : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm transition-colors duration-150",
                collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
                active
                  ? "bg-primary-soft font-semibold text-primary"
                  : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <CalendarBlank
                className="h-[18px] w-[18px] flex-shrink-0"
                weight={active ? "fill" : "regular"}
              />
              {!collapsed && <span className="line-clamp-1">{ev.title}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
