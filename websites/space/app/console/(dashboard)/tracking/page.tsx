"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { CaretDown, CaretRight, Ticket } from "@unifesto/unicon/react";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Skeleton } from "@/console/components/ui/skeleton";
import { ShortLinksPanel, TrackingLinks, TrafficSummary, fmt } from "@/console/components/tracking/TrackingParts";
import { getSpaceRegistrationSources, sourceLabel, type SpaceRegistrationSource } from "@/console/lib/api/tracking";
import { conversion, getTraffic, type SpaceTrafficStats, type TrafficScope } from "@/console/lib/api/traffic";
import { useSession } from "@/console/lib/context/SessionContext";

const keyOf = (s: SpaceRegistrationSource) => `${s.source}|${s.medium}|${s.campaign}`;

/**
 * Tracking across the whole space (port of SpaceTrackingScreen): traffic to the
 * space page and its events, which sources bring people in (expand for the
 * per-event split, then drill into who), plus space-level short links.
 */
export default function SpaceTrackingPage() {
  const { currentSpace, can } = useSession();
  const spaceId = currentSpace?.id ?? "";
  const scope = useMemo<TrafficScope>(() => ({ kind: "space", id: spaceId }), [spaceId]);
  const [data, setData] = useState<{ total: number; tagged: number; sources: SpaceRegistrationSource[] } | null>(null);
  const [traffic, setTraffic] = useState<SpaceTrafficStats | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!spaceId) return;
    const [res, views] = await Promise.all([getSpaceRegistrationSources(spaceId), getTraffic<SpaceTrafficStats>(scope)]);
    if (views.ok) setTraffic(views.data);
    if (res.ok) setData(res.data);
    else setError(res.denied ? "You need access to this space to see its tracking." : res.message);
  }, [spaceId, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = data?.total ?? 0;
  const slug = currentSpace?.slug;

  return (
    <div className="space-y-8">
      <PageHeader title="Tracking" subtitle="Traffic to your space and events, and which links bring registrations in." />
      {error && <ErrorNotice message={error} />}
      {!data && !error ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          {traffic && (
            <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
              <TrafficSummary
                stats={[
                  { label: "Page views", value: fmt(traffic.views) },
                  { label: "Visitors", value: fmt(traffic.visitors) },
                  { label: "Registrations", value: fmt(traffic.registrations) },
                  { label: "Registered per visitor", value: conversion(traffic.registrations, traffic.visitors) },
                ]}
                daily={traffic.daily.map((d) => d.views)}
                caption={`Views of the space page and its events in the app, last ${traffic.days} days`}
              />
              {(traffic.topEvents.length > 0 || traffic.spacePageViews > 0) && (
                <ListGroup title="Most viewed">
                  {traffic.spacePageViews > 0 && <ListRow label="Space page" value={fmt(traffic.spacePageViews)} />}
                  {traffic.topEvents.map((e) => (
                    <ListRow key={e.id} label={e.title ?? e.slug} value={fmt(e.views)} href={`/console/events/${e.id}/tracking`} />
                  ))}
                </ListGroup>
              )}
            </div>
          )}

          {data && (
            <ListGroup
              title="By source"
              description={`${total ? Math.round((data.tagged / total) * 100) : 0}% of ${fmt(total)} confirmed registrations came through a tracking link.`}
            >
              {data.sources.length === 0 ? (
                <EmptyState
                  icon={Ticket}
                  title="No confirmed registrations yet"
                  description="Once people register for your events, you'll see which links and channels brought them in."
                  className="py-8"
                />
              ) : (
                data.sources.map((s) => {
                  const k = keyOf(s);
                  const isOpen = open === k;
                  const q = new URLSearchParams({ source: s.source ?? "", medium: s.medium ?? "", campaign: s.campaign ?? "" });
                  return (
                    <Fragment key={k}>
                      <ListRow
                        icon={isOpen ? <CaretDown className="h-4 w-4" /> : <CaretRight className="h-4 w-4" />}
                        label={sourceLabel(s)}
                        sublabel={s.campaign ?? undefined}
                        value={`${fmt(s.registrations)} · ${Math.round((s.registrations / total) * 100)}%`}
                        onClick={() => setOpen(isOpen ? null : k)}
                      />
                      {isOpen &&
                        s.events.map((ev) => (
                          <div key={ev.id} className="bg-muted/40 pl-8">
                            <ListRow
                              label={ev.title}
                              value={fmt(ev.registrations)}
                              href={`/console/events/${ev.id}/tracking/source?${q}`}
                            />
                          </div>
                        ))}
                    </Fragment>
                  );
                })
              )}
            </ListGroup>
          )}

          {spaceId && (
            <ShortLinksPanel scope={scope} canEdit={can("space:manage-members")} destination="the space page" />
          )}
          {slug && <TrackingLinks url={`https://www.unifesto.app/space/${slug}`} campaign={slug} />}
        </>
      )}
    </div>
  );
}
