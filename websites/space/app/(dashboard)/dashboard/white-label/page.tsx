"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useCallback, useEffect, useState } from "react";

import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { WhiteLabelSection } from "@/components/white-label/WhiteLabelSection";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getWhiteLabelOverview,
  type WhiteLabelOverview,
  type WhiteLabelRequest,
} from "@/lib/api/white-label-api";

/**
 * Organiser white-label hub for a space. White-label is colour-only: the
 * space-level accent sits on top and is inherited by every event; below, each
 * event can request its own accent. One overview fetch drives the whole page
 * from the live Space/Event rows, so admin-applied branding and co-admins'
 * requests show up correctly.
 */
export default function SpaceWhiteLabelPage() {
  const spaceId = useSpaceId();

  const [data, setData] = useState<WhiteLabelOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getWhiteLabelOverview(spaceId);
    if (error) setError(error.message);
    else {
      setError("");
      setData(data);
    }
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Requests are newest first, so the first match is the latest for a target.
  const latestFor = (eventId: string | null): WhiteLabelRequest | null =>
    data?.requests.find((r) => (r.eventId ?? null) === eventId) ?? null;

  const spaceColor =
    data?.space.whiteLabelEnabled && data.planHasBranding
      ? data.space.brandColor
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Branding"
        title="White-label"
        subtitle="Use your own accent colour on your public pages and in the app"
      />

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : data ? (
        <>
          <WhiteLabelSection
            spaceId={spaceId}
            enabled={data.space.whiteLabelEnabled}
            brandColor={data.space.brandColor}
            latestRequest={latestFor(null)}
            planHasBranding={data.planHasBranding}
            surfaces={data.space}
            onChanged={load}
          />

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Event colours
            </h2>
            <p className="text-sm text-muted-foreground">
              Events use your space colour automatically. Request a separate
              colour for an event only when it needs its own look.
            </p>

            {data.events.length === 0 ? (
              <p className="pt-2 text-sm text-muted-foreground">
                This space has no events yet.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {data.events.map((event) => {
                  const open = expanded === event.id;
                  const latest = latestFor(event.id);
                  const pending =
                    !event.whiteLabelEnabled && latest?.status === "PENDING";
                  const swatch = event.whiteLabelEnabled
                    ? event.brandColor
                    : spaceColor;
                  return (
                    <div key={event.id}>
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : event.id)}
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {swatch && (
                            <span
                              aria-hidden
                              className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-border"
                              style={{ backgroundColor: swatch }}
                            />
                          )}
                          <span className="truncate text-sm font-medium text-foreground">
                            {event.title}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {event.whiteLabelEnabled ? (
                            <Badge variant="success">Own colour</Badge>
                          ) : pending ? (
                            <Badge variant="warning">Pending review</Badge>
                          ) : spaceColor ? (
                            <Badge variant="neutral">Space colour</Badge>
                          ) : null}
                          {open ? (
                            <CaretDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <CaretRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                      </button>
                      {open && (
                        <div className="px-4 pb-4">
                          <WhiteLabelSection
                            spaceId={spaceId}
                            eventId={event.id}
                            enabled={event.whiteLabelEnabled}
                            brandColor={event.brandColor}
                            latestRequest={latest}
                            planHasBranding={data.planHasBranding}
                            inheritedColor={spaceColor}
                            onChanged={load}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
