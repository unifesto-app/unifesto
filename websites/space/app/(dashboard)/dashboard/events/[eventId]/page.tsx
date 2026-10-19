"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarBlank,
  MapPin,
  Users,
  Clock,
  GlobeSimple,
  PencilSimple,
  Trash,
  CheckCircle,
  Megaphone,
} from "@unifesto/unicon/react";
import { publishEvent, deleteEvent } from "@/lib/api/events-api";
import type { Event } from "@/lib/api/events-api";
import { getCheckinStats, getAttendeeStats } from "@/lib/api/registrations-api";
import type { CheckinStats, AttendeeStats } from "@/lib/api/registrations-api";
import { useLayoutEvent } from "@/components/events/EventLayoutContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/shared/StatCard";
import { RegistrationSourcesCard } from "@/components/shared/RegistrationSourcesCard";
import { EventCompleteness } from "@/components/shared/EventCompleteness";
import { AnnounceDialog } from "./AnnounceDialog";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * "1 August 2026 at 9:00 AM - 6:00 PM" when the event is on a single day, or
 * "1 August 2026 at 9:00 AM - 3 August 2026 at 6:00 PM" when it spans days.
 */
function formatDateTimeRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  return `${formatDateTime(startIso)} - ${
    sameDay ? formatTime(endIso) : formatDateTime(endIso)
  }`;
}

export default function EventOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  // The layout already loaded the event (B12: it was fetched twice).
  const layout = useLayoutEvent();
  const event: Event | null = layout?.event ?? null;
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const loading = !event;
  const [error] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [attendeeStats, setAttendeeStats] = useState<AttendeeStats | null>(null);

  const loadEvent = useCallback(async () => {
    await layout?.reload();
  }, [layout]);

  const loadStats = useCallback(async () => {
    const { data } = await getCheckinStats(eventId);
    if (data) setStats(data);
  }, [eventId]);

  const loadAttendees = useCallback(async () => {
    const { data } = await getAttendeeStats(eventId);
    if (data) setAttendeeStats(data);
  }, [eventId]);

  useEffect(() => {
    void loadStats();
    void loadAttendees();
  }, [loadStats, loadAttendees]);

  const handlePublish = async () => {
    if (!event || !window.confirm("Publish this event? It will be visible to attendees.")) return;
    setActionLoading(true);
    const { error } = await publishEvent(eventId);
    if (error) {
      alert(error.message);
    } else {
      await loadEvent();
    }
    setActionLoading(false);
  };

  const handleDelete = async () => {
    if (!event || event.status !== "DRAFT") return;
    if (!window.confirm("Delete this draft event? This cannot be undone.")) return;
    setActionLoading(true);
    const { error } = await deleteEvent(eventId);
    if (error) {
      alert(error.message);
      setActionLoading(false);
    } else {
      router.push(`/dashboard/events`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="space-y-6">
        <ErrorNotice message={error || "Event not found"} />
      </div>
    );
  }

  const hasPeople = attendeeStats?.checkedIn != null;
  const checkedInPeople = hasPeople ? attendeeStats!.checkedIn : stats?.checkedIn ?? 0;
  const headcount = hasPeople ? attendeeStats!.attendees : stats?.total ?? 0;
  const peopleUnit = hasPeople ? "attendees" : "bookings";

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <PageHeader
        title="Event Overview"
        subtitle={`Manage and monitor ${event.title}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {event.status === "DRAFT" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePublish}
                disabled={actionLoading}
              >
                <CheckCircle className="h-4 w-4" />
                Publish
              </Button>
            )}
            {(event.status === "PUBLISHED" || event.status === "ONGOING") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAnnounceOpen(true)}
              >
                <Megaphone className="h-4 w-4" />
                Announce
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => router.push(`/dashboard/events/${eventId}/edit`)}
            >
              <PencilSimple className="h-4 w-4" />
              Edit
            </Button>
          </div>
        }
      />

      <AnnounceDialog
        eventId={eventId}
        open={announceOpen}
        onOpenChange={setAnnounceOpen}
      />

      {/* Setup completeness — event info, registration and richer content.
          Most useful while a DRAFT is being built; hidden once completed or
          cancelled, where the checklist no longer makes sense. */}
      {event.status !== "COMPLETED" && event.status !== "CANCELLED" && (
        <EventCompleteness event={event} />
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Headcount, not booking count. One group booking can be twenty
            people, so "Registrations" read as a much smaller number than the
            room actually holds. The hint spells out where the people come
            from, and is omitted when there are no groups to disambiguate. */}
        <StatCard
          title="People attending"
          value={(
            attendeeStats?.attendees ?? event.registeredCount ?? 0
          ).toString()}
          icon={Users}
          tone="brand"
          hint={
            attendeeStats
              ? attendeeStats.group.groups > 0
                ? `${attendeeStats.individual.attendees} individual · ${attendeeStats.group.attendees} in ${attendeeStats.group.groups} ${attendeeStats.group.groups === 1 ? "group" : "groups"}`
                : "All individual bookings"
              : undefined
            // B14: Tickets and Check-in count bookings (a group once); this
            // counts people, so the two numbers differ on purpose.
          }
        />
        {/* People, like the card beside it. Falls back to bookings only if
            the backend doesn't send a people count yet. */}
        <StatCard
          title={hasPeople ? "People checked in" : "Bookings checked in"}
          value={checkedInPeople.toString()}
          icon={CheckCircle}
          tone="success"
          hint={
            headcount > 0
              ? `${Math.round((checkedInPeople / headcount) * 100)}% of ${headcount} ${peopleUnit}`
              : undefined
          }
        />
        <StatCard
          title={hasPeople ? "People not checked in" : "Bookings not checked in"}
          value={Math.max(0, headcount - checkedInPeople).toString()}
          icon={Clock}
          hint={`${peopleUnit[0].toUpperCase()}${peopleUnit.slice(1)} not yet checked in`}
        />
      </div>

      {/* Per-ticket headcount. Only worth showing with more than one ticket
          type — with a single ticket it just restates the number above. */}
      {attendeeStats && attendeeStats.byTicketType.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Attendees by ticket</CardTitle>
            <CardDescription>
              People, not bookings. A group booking counts as everyone in it.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-2">
            <ul className="divide-y divide-border">
              {attendeeStats.byTicketType.map((t) => (
                <li
                  key={t.ticketTypeId ?? t.name}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {t.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.kind === "GROUP"
                        ? `${t.bookings} ${t.bookings === 1 ? "group" : "groups"}`
                        : `${t.bookings} ${t.bookings === 1 ? "booking" : "bookings"}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {t.attendees}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Campaign attribution — only once the event has a public link. */}
      {event.status !== "DRAFT" && event.slug && (
        <RegistrationSourcesCard eventId={eventId} slug={event.slug} />
      )}

      {/* Event Details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4">
            <div className="flex items-start gap-3">
              <CalendarBlank className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Date & Time</p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTimeRange(event.startDateTime, event.endDateTime)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {event.type === "ONLINE" ? (
                <GlobeSimple className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              ) : (
                <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-medium">Location</p>
                <p className="text-sm text-muted-foreground">
                  {event.type === "ONLINE"
                    ? event.onlinePlatform || "Online"
                    : event.venueName || event.city || "Venue TBA"}
                </p>
                {event.venueAddress && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {event.venueAddress}
                  </p>
                )}
              </div>
            </div>

            {event.description && (
              <div>
                <p className="text-sm font-medium mb-1">Description</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {event.description}
                </p>
              </div>
            )}

            {event.tags && event.tags.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {event.tags.map((tag, idx) => (
                    <Badge key={idx} variant="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ticket Types */}
        {event.ticketTypes && event.ticketTypes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Ticket Types</CardTitle>
              <CardDescription>
                {(() => {
                  // Derive from the actual ticket prices, not the legacy
                  // registrationType flag (which is unreliable).
                  const prices = (event.ticketTypes ?? []).map((t) =>
                    Number(t.price)
                  );
                  if (prices.every((p) => p === 0)) return "Free registration";
                  if (prices.every((p) => p > 0)) return "Paid tickets";
                  return "Mixed (free and paid tickets)";
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 py-4">
              <div className="space-y-3">
                {event.ticketTypes.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{ticket.name}</p>
                      {ticket.description && (
                        <p className="text-sm text-muted-foreground">
                          {ticket.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {ticket.soldCount} / {ticket.totalQuantity} sold
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {ticket.currency === "INR" ? "₹" : ticket.currency}
                        {Number(ticket.price).toLocaleString("en-IN")}
                      </p>
                      <Badge
                        variant={ticket.isActive ? "success" : "neutral"}
                        className="mt-1"
                      >
                        {ticket.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Agenda */}
      {event.agenda && event.agenda.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Agenda</CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-4">
            <div className="space-y-4">
              {event.agenda
                .sort((a, b) => a.order - b.order)
                .map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      {item !== event.agenda![event.agenda!.length - 1] && (
                        <div className="w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(item.startTime)} -{" "}
                        {formatTime(item.endTime)}
                      </p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.description}
                        </p>
                      )}
                      {item.speakerName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Speaker: {item.speakerName}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
