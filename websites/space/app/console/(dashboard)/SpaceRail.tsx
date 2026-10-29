"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, CaretLeft, CaretRight } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { useMobileNav } from "@/console/lib/context/MobileNavContext";
import { useDrawerBehavior } from "@/console/lib/hooks/useDrawerBehavior";
import { useCollapsibleRail } from "@/console/lib/hooks/useCollapsibleRail";
import { SpaceNav } from "@/console/components/shell/SpaceNav";
import { EventNav } from "@/console/components/shell/EventNav";
import { EventAccessNav } from "@/console/components/shell/EventAccessNav";
import { EventAccessChooser } from "@/console/components/shell/EventAccessChooser";
import { isEventScopedSpace } from "@/console/lib/types/rbac";
import { Skeleton } from "@/console/components/ui/skeleton";
import { cn } from "@/console/lib/utils/cn";

/**
 * When the route is inside a specific event, the shared rail morphs to that
 * event's sections. Matches `/console/events/<id>...` but not the list
 * (`/console/events`) or the create wizard (`/console/events/new`).
 */
function eventIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/console\/events\/([^/]+)/);
  const id = match?.[1];
  return id && id !== "new" ? id : null;
}

export default function SpaceDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentSpace, loading, can } = useSession();
  const { open, setOpen } = useMobileNav();
  const [collapsed, toggleCollapsed] = useCollapsibleRail();

  const eventId = eventIdFromPath(pathname);

  // Event-only operators (no space-level role) get a scoped experience: they
  // reach only the events they were added to, never space-level pages.
  const eventOnly = isEventScopedSpace(currentSpace);
  const eventAccess = currentSpace?.eventAccess ?? [];
  const currentEvent =
    eventId != null
      ? eventAccess.find((e) => e.eventId === eventId)
      : undefined;
  // For an event-only user, whether they may view the event in the URL.
  const viewingOwnEvent = eventId != null && currentEvent != null;
  // The Assist inbox is the one space-level page they may open: the backend
  // lists only their events' cases.
  const onDeskInbox =
    (pathname === "/console/assist" || pathname.startsWith("/console/assist/")) &&
    can("event:manage-support");
  // Any other space-level page is off-limits to an event-only user.
  const blockedForEventOnly = eventOnly && !viewingOwnEvent && !onDeskInbox;

  // Auto-close the drawer whenever the route changes — tapping a destination
  // (or the browser back button) should always drop us back to the page.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // Event-only operator with a single event: skip the picker and drop them
  // straight into it.
  useEffect(() => {
    if (blockedForEventOnly && eventAccess.length === 1) {
      router.replace(`/console/events/${eventAccess[0].eventId}`);
    }
  }, [blockedForEventOnly, eventAccess, router]);

  // Escape-to-close + background scroll-lock while the drawer is open.
  useDrawerBehavior(open, () => setOpen(false));

  // Chooses the rail contents for the current context (shared by the desktop
  // rail and the mobile drawer).
  const renderNav = (opts: { collapsed?: boolean; onNavigate?: () => void }) => {
    if (eventOnly) {
      return viewingOwnEvent ? (
        <EventNav
          eventId={eventId!}
          collapsed={opts.collapsed}
          onNavigate={opts.onNavigate}
        />
      ) : (
        <EventAccessNav
          events={eventAccess}
          collapsed={opts.collapsed}
          onNavigate={opts.onNavigate}
        />
      );
    }
    return eventId ? (
      <EventNav eventId={eventId} collapsed={opts.collapsed} onNavigate={opts.onNavigate} />
    ) : (
      <SpaceNav collapsed={opts.collapsed} onNavigate={opts.onNavigate} />
    );
  };

  if (loading || !currentSpace) {
    return (
      <>
        <aside className="fixed left-0 top-16 bottom-0 z-10 hidden w-60 border-r border-border bg-sidebar p-4 lg:block">
          <div className="flex min-h-full flex-col space-y-4">
            <Skeleton className="h-12 w-full" />
            <div className="flex-1 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </div>
        </aside>
        <main className="lg:ml-60">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {/* Desktop rail — always visible from lg up; collapses to an icon strip */}
      <aside
        className={cn(
          "fixed left-0 top-16 bottom-0 z-10 hidden flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="flex-1 overflow-y-auto">
          {renderNav({ collapsed })}
        </div>
        {/* Collapse toggle — pinned to the foot of the rail */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center gap-3 border-t border-border px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? (
            <CaretRight className="h-[18px] w-[18px] flex-shrink-0" />
          ) : (
            <>
              <CaretLeft className="h-[18px] w-[18px] flex-shrink-0" />
              Collapse
            </>
          )}
        </button>
      </aside>

      {/* Mobile drawer — dimmed overlay + slide-in panel, below lg only */}
      <div
        className={cn(
          "fixed inset-0 top-16 z-30 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        {/* Overlay */}
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-foreground/40 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0"
          )}
        />
        {/* Panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Space navigation"
          className={cn(
            "absolute left-0 top-0 bottom-0 w-[17rem] max-w-[85vw] overflow-y-auto border-r border-border bg-sidebar shadow-lg transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex justify-end p-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {renderNav({ onNavigate: () => setOpen(false) })}
        </div>
      </div>

      {/* Main content — full width on mobile, offset by the rail from lg up */}
      <main
        className={cn(
          "transition-[margin] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          collapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          {blockedForEventOnly ? (
            // Space-level page is off-limits to an event-only operator. A single
            // event is auto-redirected (above); otherwise show the event picker.
            eventAccess.length === 1 ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <EventAccessChooser events={eventAccess} />
            )
          ) : (
            children
          )}
        </div>
      </main>
    </>
  );
}
