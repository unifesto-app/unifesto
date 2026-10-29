"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Users } from "@unifesto/unicon/react";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Skeleton } from "@/console/components/ui/skeleton";
import { getSourceAttendees, sourceLabel, type SourceAttendee } from "@/console/lib/api/tracking";

/** Who registered through one source of an event's breakdown (port of SourceAttendeesScreen). */
export default function SourceAttendeesPage() {
  const eventId = useParams().eventId as string;
  const q = useSearchParams();
  const tags = {
    source: q.get("source") || null,
    medium: q.get("medium") || null,
    campaign: q.get("campaign") || null,
  };
  const key = `${tags.source}|${tags.medium}|${tags.campaign}`;
  const [rows, setRows] = useState<SourceAttendee[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getSourceAttendees(eventId, tags).then((r) => (r.ok ? setRows(r.data) : setError(r.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, key]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tracking"
        title={sourceLabel(tags)}
        subtitle={[tags.medium, tags.campaign].filter(Boolean).join(" · ") || undefined}
      />
      {error && <ErrorNotice message={error} />}
      {!rows && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        rows && (
          <ListGroup title={`${rows.length} registration${rows.length === 1 ? "" : "s"}`}>
            {rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody yet"
                description="Confirmed registrations from this source will be listed here."
                className="py-8"
              />
            ) : (
              rows.map((r) => (
                <ListRow
                  key={r.id}
                  label={r.user.fullName || r.user.username || "Attendee"}
                  sublabel={[
                    r.ticketType?.name,
                    r.groupSize && r.groupSize > 1 ? `Group of ${r.groupSize}` : r.quantity > 1 ? `${r.quantity} tickets` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  value={new Date(r.registeredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  href={`/dashboard/events/${eventId}/attendees/${r.id}`}
                />
              ))
            )}
          </ListGroup>
        )
      )}
    </div>
  );
}
