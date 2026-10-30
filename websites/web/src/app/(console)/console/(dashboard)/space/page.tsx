"use client";

import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarBlank,
  CheckCircle,
  PencilSimple,
  Sparkle,
  UsersThree,
  MapPin,
  GlobeSimple,
  ArrowRight,
  Plus,
  Ticket,
  CurrencyInr,
} from "@unifesto/unicon/react";
import { getSpaceEvents } from "@/console/lib/api/events-api";
import type { Event } from "@/console/lib/api/events-api";
import type { SpaceWithHierarchy } from "@/console/lib/types/rbac";
import { useSession } from "@/console/lib/context/SessionContext";
import { StatCard } from "@/console/components/shared/StatCard";
import { StatusBadge } from "@/console/components/shared/StatusBadge";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";
import { cn } from "@/console/lib/utils/cn";

/* ---------------------------------------------------------------------------
 * Prioritisation — the one spot where product judgment lives.
 *
 * These two pure functions decide what an operator sees first when they land.
 * The defaults: "upcoming" = live or future events that haven't ended, soonest
 * start first (so anything happening now leads); "needs
 * attention" = drafts, most-recently-touched first (a draft is unfinished work
 * that only the operator can move forward). If your team thinks in different
 * terms — events nearly sold out, events ending soon, low-registration events —
 * change the sort/filter here and the whole overview follows.
 * ------------------------------------------------------------------------- */

function selectUpcoming(events: Event[], limit = 5): Event[] {
  const now = Date.now();
  return events
    .filter(
      (e) =>
        (e.status === "PUBLISHED" || e.status === "ONGOING") &&
        new Date(e.endDateTime).getTime() >= now
    )
    .sort(
      (a, b) =>
        new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    )
    .slice(0, limit);
}

function selectNeedsAttention(events: Event[], limit = 4): Event[] {
  return events
    .filter((e) => e.status === "DRAFT")
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, limit);
}

function attendeeTotal(e: Event): number {
  return e.attendees?.total ?? e.registeredCount ?? 0;
}

/** Two-line date chip — big day number over a short month. */
function DateChip({ iso }: { iso?: string }) {
  const d = iso ? new Date(iso) : null;
  return (
    <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg border border-border bg-background text-center leading-none">
      {d ? (
        <>
          <span className="text-base font-semibold tracking-tight text-foreground">
            {d.toLocaleDateString("en-IN", { day: "2-digit" })}
          </span>
          <span className="text-eyebrow mt-0.5">
            {d.toLocaleDateString("en-IN", { month: "short" })}
          </span>
        </>
      ) : (
        <CalendarBlank className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
}

/**
 * Space dashboard overview — the operator's home. Stats up top, upcoming events
 * as the main column, drafts and quick actions in the rail.
 */
export default function SpaceDashboardPage() {
  const router = useRouter();
  const spaceId = useSpaceId();
  const { user, spaces, can, loading: sessionLoading } = useSession();
  const canCreate = can("space:create-event");

  const [currentSpace, setCurrentSpace] = useState<SpaceWithHierarchy | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) {
      router.push("/console");
      return;
    }
    setCurrentSpace(space);
  }, [spaceId, spaces, sessionLoading, router]);

  useEffect(() => {
    if (!currentSpace) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await getSpaceEvents(currentSpace.id, { limit: 100 });
      if (cancelled) return;
      if (error) setError(error.message);
      else setEvents(data?.events ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSpace]);

  const busy = sessionLoading || loading || !currentSpace;

  const stats = useMemo(() => {
    const published = events.filter(
      (e) => e.status === "PUBLISHED" || e.status === "ONGOING"
    ).length;
    const drafts = events.filter((e) => e.status === "DRAFT").length;
    const attendees = events.reduce((sum, e) => sum + attendeeTotal(e), 0);
    return { published, drafts, attendees, total: events.length };
  }, [events]);

  const upcoming = useMemo(() => selectUpcoming(events), [events]);
  const attention = useMemo(() => selectNeedsAttention(events), [events]);
  const firstName = (user?.name ?? "there").split(" ")[0];
  const hasNoEvents = !busy && events.length === 0;

  if (busy) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-lg lg:col-span-2" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&rsquo;s what&rsquo;s happening in this space.
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/console/events/new">
              <Sparkle className="h-4 w-4" weight="fill" />
              Create an event
            </Link>
          </Button>
        )}
      </header>

      {error && <ErrorNotice message={error} />}

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Published"
          value={stats.published}
          hint="Live and open"
          icon={CheckCircle}
          tone="success"
          href="/console/events"
        />
        <StatCard
          title="In progress"
          value={stats.drafts}
          hint="Drafts to finish"
          icon={PencilSimple}
          href="/console/events"
        />
        <StatCard
          title="People attending"
          value={stats.attendees.toLocaleString("en-IN")}
          hint="Across all events; each group member counts"
          icon={UsersThree}
          tone="brand"
        />
        <StatCard
          title="All events"
          value={stats.total}
          hint="Everything in this space"
          icon={CalendarBlank}
          href="/console/events"
        />
      </div>

      {hasNoEvents ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={CalendarBlank}
              tone="positive"
              title="Create your first event"
              description="Once you publish an event, it appears here with sign-ups, drafts, and everything that needs your attention."
              action={
                canCreate ? (
                  <Button asChild>
                    <Link href="/console/events/new">
                      <Plus className="h-4 w-4" weight="bold" />
                      New event
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Upcoming — main column */}
          <section className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Live and upcoming
              </h2>
              <Link
                href="/console/events"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                All events
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <Card>
              {upcoming.length === 0 ? (
                <CardContent className="py-10">
                  <EmptyState
                    icon={CalendarBlank}
                    title="Nothing on the calendar yet"
                    description="Published events that haven't ended yet show up here."
                  />
                </CardContent>
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/console/events/${e.id}`}
                        className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/60"
                      >
                        <DateChip iso={e.startDateTime} />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate font-medium text-foreground">
                              {e.title}
                            </p>
                            {/* Already started (the list holds only events that haven't ended). */}
                            {new Date(e.startDateTime).getTime() <= Date.now() && (
                              <StatusBadge status="ongoing" />
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {e.type === "ONLINE" ? (
                              <GlobeSimple className="h-3.5 w-3.5 flex-shrink-0" />
                            ) : (
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            )}
                            <span className="truncate">
                              {e.venueName || e.city || "Location TBA"}
                            </span>
                          </div>
                        </div>
                        <div className="hidden text-right sm:block">
                          <p className="text-sm font-medium text-foreground">
                            {attendeeTotal(e).toLocaleString("en-IN")}
                          </p>
                          <p className="text-eyebrow">going</p>
                        </div>
                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {/* Rail — needs attention + quick actions */}
          <aside className="space-y-4">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Needs attention
              </h2>
              <Card>
                {attention.length === 0 ? (
                  <CardContent className="flex items-center gap-3 py-6">
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-success-soft text-success">
                      <CheckCircle className="h-[18px] w-[18px]" weight="duotone" />
                    </span>
                    <p className="text-sm text-muted-foreground">
                      You&rsquo;re all caught up. No drafts waiting.
                    </p>
                  </CardContent>
                ) : (
                  <ul className="divide-y divide-border">
                    {attention.map((e) => (
                      <li key={e.id}>
                        <Link
                          href={`/console/events/${e.id}/edit`}
                          className="flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/60"
                        >
                          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-warning-soft text-warning">
                            <PencilSimple className="h-4 w-4" weight="duotone" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {e.title}
                            </p>
                            <StatusBadge status={e.status} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>

            {canCreate && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Quick actions
                </h2>
                <Card>
                  <ul className="divide-y divide-border">
                    <QuickAction
                      href="/console/events/new"
                      icon={Sparkle}
                      label="Create an event"
                      hint="Start from a name"
                    />
                    <QuickAction
                      href="/console/members"
                      icon={UsersThree}
                      label="Manage members"
                      hint="Invite and assign roles"
                    />
                    <QuickAction
                      href="/console/financials"
                      icon={CurrencyInr}
                      label="View financials"
                      hint="Collected, refunded, net"
                    />
                    <QuickAction
                      href="/console/events"
                      icon={Ticket}
                      label="All events"
                      hint="Browse and filter"
                    />
                  </ul>
                </Card>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon: IconCmp,
  label,
  hint,
}: {
  href: string;
  icon: typeof Sparkle;
  label: string;
  hint: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group flex items-center gap-3 p-3.5 transition-colors hover:bg-muted/60"
        )}
      >
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <IconCmp className="h-4 w-4" weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}
