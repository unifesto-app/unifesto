"use client";

import { useEffect, useState } from "react";
import { CheckCircle, WarningCircle } from "@unifesto/unicon/react";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { useLayoutEvent } from "@/console/components/events/EventLayoutContext";
import { hackBase, useEventRunning } from "@/console/components/hackathon/HackParts";
import { getHackathonOverview, type HackathonOverview } from "@/console/lib/api/hackathon";

type Counts = HackathonOverview["counts"];

/** True once the event is over by the clock or marked completed; a cancelled event has nothing to wrap up. */
function useWrapUpDue() {
  const running = useEventRunning();
  const status = useLayoutEvent()?.event?.status;
  return !running && status !== "CANCELLED";
}

/**
 * What's left to close out a finished hackathon: open rounds, unpublished
 * winners, certificates, open help-desk queries and judges who never signed
 * in. Read-only: each line shows a count and links to the page that fixes it.
 * Renders nothing until the event has ended.
 */
export function EndOfEventChecklist({ eventId, counts }: { eventId: string; counts: Counts }) {
  const due = useWrapUpDue();
  if (!due) return null;
  const base = hackBase(eventId);
  const unpublished = counts.awards - counts.awardsPublished;
  const items = [
    counts.openRounds
      ? { todo: true, label: "Close open rounds", value: `${counts.openRounds} open`, href: `${base}/rounds` }
      : { todo: false, label: "Rounds closed", value: undefined, href: `${base}/rounds` },
    !counts.awards
      ? { todo: true, label: "Publish winners", value: "No awards yet", href: `${base}/winners` }
      : unpublished
        ? { todo: true, label: "Publish winners", value: `${unpublished} of ${counts.awards} unpublished`, href: `${base}/winners` }
        : { todo: false, label: "Winners published", value: String(counts.awards), href: `${base}/winners` },
    counts.certificates
      ? { todo: false, label: "Certificates issued", value: String(counts.certificates), href: `${base}/certificates` }
      : { todo: true, label: "Issue certificates", value: "None issued", href: `${base}/certificates` },
    counts.openQueries
      ? { todo: true, label: "Close help-desk queries", value: `${counts.openQueries} open`, href: `${base}/help-desk` }
      : { todo: false, label: "Help-desk queries closed", value: undefined, href: `${base}/help-desk` },
    ...(counts.judgesNotSignedIn
      ? [{ todo: true, label: "Judges who never signed in", value: `${counts.judgesNotSignedIn} of ${counts.judges}`, href: `${base}/judges` }]
      : []),
  ];
  const left = items.filter((i) => i.todo).length;

  return (
    <ListGroup
      title="End-of-event checklist"
      description={left ? `${left} thing${left === 1 ? "" : "s"} left to close out this hackathon.` : "Everything is closed out."}
    >
      {items.map((i) => (
        <ListRow
          key={i.label}
          icon={
            i.todo ? (
              <WarningCircle className="h-5 w-5 text-warning" weight="fill" />
            ) : (
              <CheckCircle className="h-5 w-5 text-success" weight="fill" />
            )
          }
          label={i.label}
          value={i.value}
          href={i.href}
        />
      ))}
    </ListGroup>
  );
}

/**
 * The checklist on the event overview: fetched only once the event has ended,
 * and shown only when the event runs a hackathon this person can manage.
 */
export function EventEndOfEventChecklist({ eventId }: { eventId: string }) {
  const due = useWrapUpDue();
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    if (!due) return;
    getHackathonOverview(eventId).then((res) => {
      if (res.ok && res.data.hackathon?.enabled) setCounts(res.data.counts);
    });
  }, [due, eventId]);
  return counts ? <EndOfEventChecklist eventId={eventId} counts={counts} /> : null;
}
