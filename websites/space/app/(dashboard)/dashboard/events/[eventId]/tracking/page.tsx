"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { Skeleton } from "@/components/ui/skeleton";
import { ShortLinksPanel, TrackingLinks, TrafficSummary, fmt } from "@/components/tracking/TrackingParts";
import { getRegistrationSources, sourceLabel, type RegistrationSources } from "@/lib/api/tracking";
import { conversion, getTraffic, type TrafficScope, type TrafficStats } from "@/lib/api/traffic";
import { getEventById } from "@/lib/api/events-api";
import { useSession } from "@/lib/context/SessionContext";
import { can } from "@/lib/types/rbac";

const WEB_URL = "https://www.unifesto.app";

/**
 * Tracking for one event (port of mobile EventTrackingScreen): page traffic,
 * where confirmed attendees came from (drill into a source), short links and
 * tagged channel links.
 */
export default function EventTrackingPage() {
  const eventId = useParams().eventId as string;
  const { currentRole } = useSession();
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
    `/dashboard/events/${eventId}/tracking/source?${new URLSearchParams({
      source: s.source ?? "",
      medium: s.medium ?? "",
      campaign: s.campaign ?? "",
    })}`;

  return (
    <div className="space-y-8">
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
                { label: "Registrations", value: fmt(traffic.registrations) },
                { label: "Registered per visitor", value: conversion(traffic.registrations, traffic.visitors) },
              ]}
              daily={traffic.daily.map((d) => d.views)}
              caption={`Views of the event page in the app, last ${traffic.days} days`}
            />
          )}

          <ListGroup
            title="Where registrations came from"
            description={
              total > 0
                ? `${sources!.tagged} of ${total} came through a tracking link. Direct means none was opened in the 7 days before registering.`
                : undefined
            }
          >
            {total === 0 ? (
              <ListRow label="No confirmed registrations yet" />
            ) : (
              sources!.sources.map((s) => (
                <ListRow
                  key={`${s.source}|${s.medium}|${s.campaign}`}
                  label={sourceLabel(s)}
                  sublabel={s.campaign ?? undefined}
                  value={`${fmt(s.registrations)} · ${Math.round((s.registrations / total) * 100)}%`}
                  href={can(currentRole, "event:manage-attendees") ? sourceHref(s) : undefined}
                />
              ))
            )}
          </ListGroup>

          <ShortLinksPanel scope={scope} canEdit={can(currentRole, "event:edit")} destination="this event" />
          {slug && <TrackingLinks url={`${WEB_URL}/event/${slug}`} campaign={slug} />}
        </>
      )}
    </div>
  );
}
