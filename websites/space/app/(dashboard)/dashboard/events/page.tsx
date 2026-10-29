"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MagnifyingGlass,
  CalendarBlank,
  Plus,
  MapPin,
  GlobeSimple,
  CaretLeft,
  CaretRight,
  ShareNetwork,
  Stack,
  UsersThree,
  ArrowsClockwise,
  Check,
  X,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  getSpaceEvents,
  getCoHostInvites,
  acceptCoHost,
  removeCoHost,
} from "@/lib/api/events-api";
import type { CoHostInvite, Event, EventStatus } from "@/lib/api/events-api";
import { parseRRuleToState, describeRecurrence } from "@/lib/recurrence";
import type { SpaceWithHierarchy } from "@/lib/types/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Status filter, plus one pseudo-option.
 *
 * "hidden" is not a status — it is the soft-delete trash view. It rides in the
 * same dropdown because hidden events are otherwise unreachable, and a second
 * control for one rarely-used view is worse than one list people already look at.
 */
type EventFilterValue = EventStatus | "all" | "hidden";

const STATUS_OPTIONS: { value: EventFilterValue; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ONGOING", label: "Ongoing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "hidden", label: "Hidden" },
];

const ITEMS_PER_PAGE = 12;

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function priceLabel(e: Event) {
  // Ticket prices are the source of truth. `isFree` defaults to true server-side
  // and isn't recomputed when paid tickets are added, so it can't be trusted; and
  // the cheapest ticket may be a ₹0 tier sitting alongside paid ones (a mixed
  // event) — taking the min over all prices made those read "Free".
  const tickets = e.ticketTypes ?? [];
  if (tickets.length > 0) {
    const prices = tickets.map((t) => Number(t.price)).filter((n) => !Number.isNaN(n));
    const paidPrices = prices.filter((p) => p > 0);
    if (paidPrices.length === 0) return "Free"; // no paid tier → genuinely free

    const minPaid = Math.min(...paidPrices);
    const currency = tickets[0]?.currency || "INR";
    const amount = minPaid.toLocaleString("en-IN");
    const from = currency === "INR" ? `From ₹${amount}` : `From ${currency} ${amount}`;
    // Mixed: free tickets alongside paid ones.
    return prices.some((p) => p === 0) ? `${from} · Free available` : from;
  }

  // No ticket data — fall back to the (unreliable) flag.
  return e.isFree ? "Free" : "Paid";
}

/**
 * Headcount for an event card. Shows *people*, not bookings — one group booking
 * can be twenty people. The individual/group split only appears when there is
 * at least one group.
 */
function AttendeeCount({ event }: { event: Event }) {
  const total = event.attendees?.total ?? event.registeredCount ?? 0;
  const groups = event.attendees?.groups ?? 0;

  if (total === 0) {
    return <span className="text-xs text-muted-foreground">No attendees yet</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <UsersThree className="h-3.5 w-3.5" />
      <span className="font-medium text-foreground">
        {total.toLocaleString("en-IN")}
      </span>
      {total === 1 ? "attendee" : "attendees"}
      {groups > 0 && (
        <span className="text-muted-foreground">
          · {groups} {groups === 1 ? "group" : "groups"}
        </span>
      )}
    </span>
  );
}

/** Cover banner with a graceful gradient fallback when no image is set. */
function EventCover({ event }: { event: Event }) {
  const Icon = event.type === "ONLINE" ? GlobeSimple : CalendarBlank;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
      {event.coverImageUrl ? (
        // Plain <img>: no images.remotePatterns is configured, so next/image
        // would reject these remote URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverImageUrl}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary-soft via-background to-muted">
          <Icon className="h-12 w-12 text-primary/40" weight="duotone" />
        </div>
      )}
      {/* Status, legible on any cover via its own solid pill background. */}
      <div className="absolute left-3 top-3">
        <StatusBadge status={event.status} />
      </div>
    </div>
  );
}

/**
 * Invites from other spaces to co-host their events. Nothing about the event
 * shows on this space until a Space Admin accepts here (F8).
 */
function CoHostInvites({ spaceId, onAccepted }: { spaceId: string; onAccepted: () => void }) {
  const [invites, setInvites] = useState<CoHostInvite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await getCoHostInvites(spaceId);
    setInvites(data ?? []);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (invite: CoHostInvite, accept: boolean) => {
    if (!accept && !confirm(`Decline co-hosting ${invite.event.title}?`)) return;
    setBusy(invite.id);
    setError("");
    const { error } = accept
      ? await acceptCoHost(invite.event.id, spaceId)
      : await removeCoHost(invite.event.id, spaceId);
    setBusy(null);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
    if (accept) onAccepted();
  };

  if (invites.length === 0) return null;
  return (
    <Card className="border-primary/30 bg-primary-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShareNetwork className="h-4 w-4 text-primary" weight="bold" />
          Co-host invites
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Accepting lists the event on this space and credits it as a co-host. Space Admins
          here can then edit it. Publishing, the team and money stay with the host.
        </p>
        {error && <ErrorNotice message={error} />}
        <ul className="divide-y divide-border rounded-md border border-border bg-background">
          {invites.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{inv.event.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  From {inv.event.space.name} · {formatDate(inv.event.startDateTime)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === inv.id} onClick={() => act(inv, true)}>
                  <Check className="h-4 w-4" weight="bold" />
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy === inv.id}
                  onClick={() => act(inv, false)}
                >
                  <X className="h-4 w-4" />
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function SpaceEventsPage() {
  const router = useRouter();
  const spaceId = useSpaceId();
  const { spaces, can, loading: sessionLoading } = useSession();
  const canCreate = can("space:create-event");

  const [currentSpace, setCurrentSpace] = useState<SpaceWithHierarchy | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EventFilterValue>("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (sessionLoading) return;
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) {
      router.push("/dashboard");
      return;
    }
    setCurrentSpace(space);
  }, [spaceId, spaces, sessionLoading, router]);

  const load = useCallback(async () => {
    if (!spaceId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const showingHidden = status === "hidden";
    const { data, error } = await getSpaceEvents(spaceId, {
      // "hidden" filters on the soft-delete flag, not on status, so no status
      // is sent with it — a hidden event may be completed or cancelled.
      status: status === "all" || showingHidden ? undefined : status,
      deleted: showingHidden ? "deleted" : "active",
      limit: 100,
    });
    if (error) setError(error.message);
    else setEvents(data?.events ?? []);
    setLoading(false);
  }, [spaceId, status]);

  useEffect(() => {
    if (sessionLoading || !currentSpace) return;
    void load();
  }, [sessionLoading, currentSpace, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.city ?? "").toLowerCase().includes(q) ||
        (e.category ?? "").toLowerCase().includes(q)
    );
  }, [events, search]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status]);

  const subtitle = loading
    ? "Loading events…"
    : `${filtered.length.toLocaleString("en-IN")} event${
        filtered.length === 1 ? "" : "s"
      }`;

  const filtersActive = Boolean(search) || status !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Events"
        title="Events"
        subtitle={subtitle}
        actions={
          canCreate ? (
            <Button onClick={() => router.push(`/dashboard/events/new`)}>
              <Plus className="h-4 w-4" weight="bold" />
              New event
            </Button>
          ) : undefined
        }
      />

      {spaceId && can("space:manage-settings") && (
        <CoHostInvites spaceId={spaceId} onAccepted={() => void load()} />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, city, or category"
            className="pl-9"
            aria-label="Search events"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as EventFilterValue)}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-64 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={CalendarBlank}
              tone={filtersActive ? "neutral" : "positive"}
              title={
                filtersActive
                  ? "No events match those filters"
                  : "Create your first event"
              }
              description={
                filtersActive
                  ? "Try clearing the search or choosing a different status."
                  : "Once you publish an event, attendees can discover and register for it."
              }
              action={
                canCreate && !filtersActive ? (
                  <Button onClick={() => router.push(`/dashboard/events/new`)}>
                    <Plus className="h-4 w-4" weight="bold" />
                    New event
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {paginatedEvents.map((event) => (
              <Link key={event.id} href={`/dashboard/events/${event.id}`} className="group">
                <Card className="card-interactive h-full overflow-hidden">
                  <EventCover event={event} />

                  <CardContent className="space-y-3 p-4">
                    {/* Relationship badges */}
                    {(event.isCoHost ||
                      (event._count?.childEvents ?? 0) > 0 ||
                      event.parentEvent ||
                      event.isRecurring) && (
                      <div className="flex flex-wrap gap-1.5">
                        {event.isRecurring && (
                          <Badge variant="brand">
                            <ArrowsClockwise className="mr-1 h-3 w-3" weight="fill" />
                            Series
                          </Badge>
                        )}
                        {event.isCoHost && (
                          <Badge variant="brand">
                            <ShareNetwork className="mr-1 h-3 w-3" />
                            Co-hosted
                          </Badge>
                        )}
                        {(event._count?.childEvents ?? 0) > 0 && (
                          <Badge variant="brand">
                            <Stack className="mr-1 h-3 w-3" weight="fill" />
                            Big event · {event._count?.childEvents}
                          </Badge>
                        )}
                        {event.parentEvent && (
                          <Badge variant="neutral">
                            <Stack className="mr-1 h-3 w-3" />
                            Sub-event
                          </Badge>
                        )}
                      </div>
                    )}

                    <h3 className="line-clamp-2 font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                      {event.title}
                    </h3>

                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {event.isRecurring ? (
                          <>
                            <ArrowsClockwise className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">
                              {describeRecurrence(
                                parseRRuleToState(event.recurringRule)
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <CalendarBlank className="h-4 w-4 flex-shrink-0" />
                            <span>{formatDate(event.startDateTime)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {event.type === "ONLINE" ? (
                          <GlobeSimple className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <MapPin className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="truncate">
                          {event.venueName || event.city || "Location TBA"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="text-sm font-medium text-foreground">
                        {priceLabel(event)}
                      </span>
                      {event.isRecurring ? (
                        <span className="text-xs font-medium text-muted-foreground">
                          Manage dates →
                        </span>
                      ) : (
                        <AttendeeCount event={event} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of{" "}
                {filtered.length} events
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <CaretLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    if (
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 1
                    ) {
                      return (
                        <Button
                          key={page}
                          aria-current={page === currentPage ? "page" : undefined}
                          variant={page === currentPage ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="min-w-[2.5rem]"
                        >
                          {page}
                        </Button>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return (
                        <span key={page} className="px-2 text-muted-foreground">
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <CaretRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
