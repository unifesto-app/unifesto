"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Ticket } from "@unifesto/unicon/react";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Skeleton } from "@/console/components/ui/skeleton";
import { PartnersPanel } from "@/console/components/tracking/PartnersPanel";
import { ShortLinksPanel, TrackingLinks, TrafficSummary, fmt } from "@/console/components/tracking/TrackingParts";
import { getRegistrationSources, sourceLabel, type RegistrationSources } from "@/console/lib/api/tracking";
import { conversion, getTraffic, type TrafficScope, type TrafficStats } from "@/console/lib/api/traffic";
import { getEventById } from "@/console/lib/api/events-api";
import { useAccess } from "@/console/lib/context/SessionContext";

const WEB_URL = "https://www.unifesto.app";

/**
 * Tracking for one event (port of mobile EventTrackingScreen): page traffic,
 * where confirmed attendees came from (drill into a source), short links,
 * partner links and tagged channel links.
 */
export default function EventTrackingPage() {
  const eventId = useParams().eventId as string;
  const { can } = useAccess(eventId);
  const scope = useMemo<TrafficScope>(() => ({ kind: "event", id: eventId }), [eventId]);
  const [slug, setSlug] = useState("");
  const [sources, setSources] = useState<RegistrationSources | null>(null);
  const [traffic, setTraffic] = useState<TrafficStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [res, views, ev] = await Promise.all([getRegistrationSources(eventId), getTraffic(scope), getEventById(eventId)]);
    if (views.ok) setTraffic(views.data);
    if (ev.data) setSlug(ev.data.slug);
    if (res.ok) setSources(res.data);
    else setError(res.message);
    setLoading(false);
  }, [eventId, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = sources?.total ?? 0;
  const sourceHref = (s: { source: string | null; medium: string | null; campaign: string | null }) =>
    `/console/events/${eventId}/tracking/source?${new URLSearchParams({
      source: s.source ?? "",
      medium: s.medium ?? "",
      campaign: s.campaign ?? "",
    })}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Tracking" subtitle="Where people find this event and what brings them in." />
      {error && <ErrorNotice message={error} />}
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {traffic && (
            <TrafficSummary
              stats={[
                { label: "Page views", value: fmt(traffic.views) },
                { label: "Visitors", value: fmt(traffic.visitors) },
                { label: "Bookings", value: fmt(traffic.registrations) },
                { label: "Bookings per visitor", value: conversion(traffic.registrations, traffic.visitors) },
              ]}
              daily={traffic.daily.map((d) => d.views)}
              caption={`Views of the event page in the app, last ${traffic.days} days`}
            />
          )}

          <ListGroup
            title="Where bookings came from"
            description={
              total > 0
                ? `${sources!.tagged} of ${total} came through a tracking link. Direct means none was opened in the 7 days before registering.`
                : undefined
            }
          >
            {total === 0 ? (
              <EmptyState
                icon={Ticket}
                title="No confirmed bookings yet"
                description="Once people register, you'll see which links and channels brought them in."
                className="py-8"
              />
            ) : (
              sources!.sources.map((s) => (
                <ListRow
                  key={`${s.source}|${s.medium}|${s.campaign}`}
                  label={sourceLabel(s)}
                  sublabel={s.campaign ?? undefined}
                  value={`${fmt(s.registrations)} · ${Math.round((s.registrations / total) * 100)}%`}
                  href={can("event:manage-attendees") ? sourceHref(s) : undefined}
                />
              ))
            )}
          </ListGroup>

          <ShortLinksPanel scope={scope} canEdit={can("event:edit")} destination="this event" />
          <PartnersPanel eventId={eventId} />
          {slug && <TrackingLinks url={`${WEB_URL}/event/${slug}`} campaign={slug} />}
        </>
      )}
    </div>
  );
}
