"use client";

import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Stack,
  MagnifyingGlass,
  Plus,
  LinkBreak,
  CalendarBlank,
  ArrowSquareOut,
  PaperPlaneTilt,
  Check,
  X,
  Buildings,
  Clock,
} from "@unifesto/unicon/react";
import {
  getEventById,
  getManagedSubEvents,
  getSpaceEvents,
  attachSubEvent,
  detachSubEvent,
  getSubEventAttachRequests,
  requestSubEventAttach,
  acceptSubEventAttach,
  declineSubEventAttach,
  cancelSubEventAttach,
  type Event,
  type SubEvent,
  type SubEventAttachRequests,
} from "@/console/lib/api/events-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";

function formatDate(iso?: string): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBA";
  return d.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusVariant(
  status: string
): "neutral" | "success" | "destructive" | "brand" {
  if (status === "PUBLISHED" || status === "ONGOING") return "success";
  if (status === "CANCELLED") return "destructive";
  return "neutral";
}

export default function EventSubEventsPage() {
  const params = useParams();
  const spaceId = useSpaceId();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [subEvents, setSubEvents] = useState<SubEvent[]>([]);
  // The space's events, used to populate the attach picker.
  const [spaceEvents, setSpaceEvents] = useState<Event[]>([]);
  // Pending cross-space attach requests concerning this event, both directions.
  const [requests, setRequests] = useState<SubEventAttachRequests>({
    incoming: [],
    outgoing: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [eventRes, subsRes, spaceRes, reqRes] = await Promise.all([
      getEventById(eventId),
      getManagedSubEvents(eventId),
      getSpaceEvents(spaceId, { limit: 100 }),
      getSubEventAttachRequests(eventId),
    ]);

    if (eventRes.error || !eventRes.data) {
      setError(eventRes.error?.message ?? "Failed to load event");
    } else {
      setEvent(eventRes.data);
    }
    if (subsRes.data) setSubEvents(subsRes.data);
    if (spaceRes.data) setSpaceEvents(spaceRes.data.events);
    if (reqRes.data) setRequests(reqRes.data);
    setLoading(false);
  }, [eventId, spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A sub-event cannot itself be a parent.
  const isChild = Boolean(event?.parentEventId);

  // "Big event" mode is derived, not stored (matches the public page): if this
  // event sells its own tickets it acts as a "full pass"; otherwise it's a pure
  // umbrella where attendees register per sub-event. Only meaningful once it
  // actually has sub-events.
  const parentHasTickets = (event?.ticketTypes?.length ?? 0) > 0;
  const isParent = subEvents.length > 0;

  // Child events already awaiting the owner's approval — hide them from the
  // picker so we don't offer to request the same nesting twice.
  const pendingChildIds = useMemo(
    () => new Set(requests.outgoing.map((r) => r.childEvent.id)),
    [requests.outgoing]
  );

  // Candidates to attach or request. Same-space events attach instantly ("Add");
  // events this space co-hosts but doesn't own need the owner's approval
  // ("Request"). Excludes this event, events already nested or already a parent,
  // and any child with a request already pending. The backend re-enforces all of
  // this plus the depth cap and the co-host link.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    // A sub-event happens during its big event (B12: a 2027 draft was offered
    // for a finished 2026 event). A day of slack either side for setup days.
    const DAY = 86_400_000;
    const from = event ? new Date(event.startDateTime).getTime() - DAY : -Infinity;
    const to = event ? new Date(event.endDateTime).getTime() + DAY : Infinity;
    const during = (e: { startDateTime: string }) => {
      const t = new Date(e.startDateTime).getTime();
      return t >= from && t <= to;
    };
    return spaceEvents
      .filter(
        (e) =>
          e.id !== eventId &&
          !e.parentEventId &&
          (e._count?.childEvents ?? 0) === 0 &&
          !pendingChildIds.has(e.id) &&
          e.status !== "CANCELLED" &&
          during(e)
      )
      .filter((e) => (q ? e.title.toLowerCase().includes(q) : true))
      .slice(0, 20);
  }, [spaceEvents, query, eventId, pendingChildIds, event]);

  const attach = async (childId: string) => {
    setBusyId(childId);
    setError("");
    const { error } = await attachSubEvent(eventId, childId);
    setBusyId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setQuery("");
    await load();
  };

  // Co-host event: can't attach it directly (another space owns it) — send its
  // owner a request. An optional note explains why to the approving space.
  const requestAttach = async (child: Event) => {
    const reason =
      prompt(
        `Send a request to ${
          child.space?.name ?? "the owning space"
        } to nest "${child.title}" under this event.\n\nOptional note:`
      ) ?? undefined;
    setBusyId(child.id);
    setError("");
    const { error } = await requestSubEventAttach(eventId, child.id, reason);
    setBusyId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setQuery("");
    await load();
  };

  const acceptRequest = async (requestId: string) => {
    setBusyId(requestId);
    setError("");
    const { error } = await acceptSubEventAttach(eventId, requestId);
    setBusyId(null);
    if (error) setError(error.message);
    else await load();
  };

  const declineRequest = async (requestId: string) => {
    setBusyId(requestId);
    setError("");
    const { error } = await declineSubEventAttach(eventId, requestId);
    setBusyId(null);
    if (error) setError(error.message);
    else await load();
  };

  const cancelRequest = async (requestId: string) => {
    setBusyId(requestId);
    setError("");
    const { error } = await cancelSubEventAttach(eventId, requestId);
    setBusyId(null);
    if (error) setError(error.message);
    else await load();
  };

  const detach = async (child: SubEvent) => {
    if (!confirm(`Remove "${child.title}" as a sub-event?`)) return;
    setBusyId(child.id);
    setError("");
    const { error } = await detachSubEvent(eventId, child.id);
    setBusyId(null);
    if (error) setError(error.message);
    else await load();
  };

  const detachSelf = async () => {
    if (!event?.parentEventId) return;
    if (!confirm("Detach this event from its parent?")) return;
    setError("");
    const { error } = await detachSubEvent(event.parentEventId, eventId);
    if (error) setError(error.message);
    else await load();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sub-events"
        subtitle="Turn this event into a “big event” by grouping other events under it. Each sub-event keeps its own tickets, capacity and check-in."
      />

      {error && <ErrorNotice message={error} />}

      {/* Incoming approvals: another space wants to nest THIS event under its
          own "big event". As the owner, this space accepts or declines. */}
      {requests.incoming.length > 0 && (
        <Card className="border-brand/40">
          <CardHeader>
            <CardTitle className="text-base">
              Requests to feature this event
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {requests.incoming.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These spaces want to list this event as a sub-event under one of
              their events. Approving nests it beneath their parent; this event
              keeps its own tickets, capacity and check-in.
            </p>
            <ul className="divide-y divide-border">
              {requests.incoming.map((r) => (
                <li key={r.id} className="space-y-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.parentEvent.title}
                      </p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Buildings className="h-3.5 w-3.5" />
                        {r.parentEvent.space.name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => acceptRequest(r.id)}
                        disabled={busyId === r.id}
                      >
                        <Check className="h-4 w-4" weight="bold" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => declineRequest(r.id)}
                        disabled={busyId === r.id}
                      >
                        <X className="h-4 w-4" />
                        Decline
                      </Button>
                    </div>
                  </div>
                  {r.reason && (
                    <p className="text-xs text-muted-foreground">
                      “{r.reason}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* This event is itself a sub-event. It can still group its own
          sub-events; the banner just lets the organiser detach it from its
          own parent. */}
      {isChild && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Part of a bigger event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This event is a sub-event of{" "}
              <span className="font-medium text-foreground">
                {event?.parentEvent?.title ?? "another event"}
              </span>
              . You can still nest its own sub-events below, or detach it to make
              it a top-level event again.
            </p>
            <Button variant="secondary" size="sm" onClick={detachSelf}>
              <LinkBreak className="h-4 w-4" />
              Detach from parent
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Derived-mode hint — helps the organiser see how attendees will be
              asked to register, so the "pass vs umbrella" choice is intentional. */}
          {isParent && (
            <div className="text-sm">
              {parentHasTickets ? (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Full-pass mode.
                  </span>{" "}
                  This event sells its own tickets, so attendees see a pass for
                  the overall event alongside the sub-events below. Sub-events
                  keep their own separate registration.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Umbrella mode.
                  </span>{" "}
                  This event has no tickets of its own, so its public page points
                  attendees straight to the sub-events to register. Add tickets to
                  this event if you want to also sell an overall pass.
                </p>
              )}
            </div>
          )}

          {/* Attach an existing event as a sub-event */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Add a sub-event</CardTitle>
              <Link
                href={`/console/events/new?parentId=${eventId}`}
              >
                <Button size="sm" variant="secondary">
                  <Plus className="h-4 w-4" weight="bold" />
                  Create new
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick another event to nest beneath this one. Your own events
                attach instantly; an event you co-host but another space owns is
                marked <span className="font-medium text-foreground">Co-host</span>{" "}
                and is added only once that space approves your request.
              </p>
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this space’s events…"
                  className="pl-9"
                />
              </div>

              <div className="rounded-md border border-border">
                {candidates.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    {query.trim()
                      ? "No matching events available to attach."
                      : "No eligible events to attach or request. Only events that start during this one are listed. An event that already has its own sub-events can't become a sub-event, one attached elsewhere must be detached first, and requests already pending are hidden."}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {candidates.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">
                              {e.title}
                            </p>
                            {e.isCoHost && (
                              <Badge variant="brand" className="text-[10px]">
                                Co-host
                              </Badge>
                            )}
                          </div>
                          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <CalendarBlank className="h-3.5 w-3.5" />
                            {formatDate(e.startDateTime)}
                            <Badge
                              variant={statusVariant(e.status)}
                              className="ml-1 text-[10px]"
                            >
                              {e.status}
                            </Badge>
                            {e.isCoHost && e.space?.name && (
                              <span className="flex items-center gap-1 truncate">
                                <Buildings className="h-3.5 w-3.5" />
                                {e.space.name}
                              </span>
                            )}
                          </p>
                        </div>
                        {e.isCoHost ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => requestAttach(e)}
                            disabled={busyId === e.id}
                            title="Owned by another space — needs their approval"
                          >
                            <PaperPlaneTilt className="h-4 w-4" weight="bold" />
                            Request
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => attach(e.id)}
                            disabled={busyId === e.id}
                          >
                            <Plus className="h-4 w-4" weight="bold" />
                            Add
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Outgoing: co-host events we've asked to pull in, awaiting the
              owning space's approval. */}
          {requests.outgoing.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Awaiting approval
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {requests.outgoing.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <ul className="divide-y divide-border">
                  {requests.outgoing.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 px-6 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {r.childEvent.title}
                          </p>
                          <Badge variant="neutral" className="text-[10px]">
                            <Clock className="mr-1 h-3 w-3" />
                            Pending
                          </Badge>
                        </div>
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <Buildings className="h-3.5 w-3.5" />
                          Sent to {r.childEvent.space.name}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelRequest(r.id)}
                        disabled={busyId === r.id}
                        title="Rescind request"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Current sub-events */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Sub-events
                {subEvents.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {subEvents.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {subEvents.length === 0 ? (
                <EmptyState
                  icon={Stack}
                  title="No sub-events yet"
                  description="Attach an event above to group it under this one."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {subEvents.map((child) => (
                    <li
                      key={child.id}
                      className="flex items-center justify-between gap-3 px-6 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {child.title}
                          </p>
                          <Badge
                            variant={statusVariant(child.status)}
                            className="text-[10px]"
                          >
                            {child.status}
                          </Badge>
                          {child.deletedAt && (
                            <Badge variant="neutral" className="text-[10px]">
                              Hidden
                            </Badge>
                          )}
                        </div>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <CalendarBlank className="h-3.5 w-3.5" />
                          {formatDate(child.startDateTime)}
                          <span>·</span>
                          {child.registeredCount} registered
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/console/events/${child.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Open sub-event"
                        >
                          <ArrowSquareOut className="h-4 w-4" />
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => detach(child)}
                          disabled={busyId === child.id}
                          title="Detach sub-event"
                        >
                          <LinkBreak className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
    </div>
  );
}
