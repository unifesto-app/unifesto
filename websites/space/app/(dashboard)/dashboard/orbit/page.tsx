"use client";

import { useEffect, useState } from "react";
import { CalendarBlank, Globe, Stack, Timer } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getOrbitCampus, type OrbitCampusView } from "@/lib/api/orbit";
import { useSession } from "@/lib/context/SessionContext";

const ORBIT_URL = "https://www.unifesto.app/orbit";
const GOAL_LABEL = { clubs: "Clubs onboarded", activeClubs: "Active clubs", paidEvents: "Paid events" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * Space › Orbit: the Orbit Lead's own campus. Tier and what the next one
 * needs, the inactivity clock, and every club with whether it's active yet.
 * Shown only on campus spaces (top-level Super spaces).
 */
export default function OrbitPage() {
  const { currentSpace } = useSession();
  const spaceId = currentSpace?.id ?? "";
  const [data, setData] = useState<OrbitCampusView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!spaceId) return;
    void getOrbitCampus(spaceId).then((res) => {
      if (res.ok) setData(res.data);
      else setError(res.denied ? "Only the campus's Space Admins can see Orbit." : res.message);
    });
  }, [spaceId]);

  if (error) return <ErrorNotice message={error} />;
  if (!data) return <Skeleton className="h-64 w-full" />;

  if (!data.leads.length) {
    return (
      <EmptyState
        icon={Globe}
        title="This campus isn't in Unifesto Orbit yet"
        description="Orbit Leads get every club on their campus running events on Unifesto."
        action={<a className="text-primary hover:underline" href={ORBIT_URL}>How Orbit works</a>}
      />
    );
  }

  const lead = data.leads[0];
  const progress = data.nextGoal
    ? (Object.keys(GOAL_LABEL) as (keyof typeof GOAL_LABEL)[])
        .filter((k) => data.nextGoal![k] !== undefined)
        .map((k) => ({ key: k, label: GOAL_LABEL[k], have: data[k], need: data.nextGoal![k]! }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Unifesto Orbit"
        title={data.name}
        subtitle={`Rank ${data.rank} of ${data.campusCount} campuses. A club is active once it has published an event.`}
      />

      {data.tier === 0 && (
        <div className="rounded-lg border bg-card p-4 text-sm">
          My first 30 days: onboard 2 clubs by <strong>{day(lead.probationEndsAt)}</strong>.
        </div>
      )}
      {data.clock && (data.clock.status === "check-in" || data.clock.status === "reopen") && (
        <div className="rounded-lg border border-destructive/40 bg-card p-4 text-sm">
          No new club or event for {data.clock.inactiveDays} days. Get one club live, or tell your Program
          Lead if you have exams so the clock pauses.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Globe} title="Tier" value={data.tierName} tone="brand" />
        <StatCard icon={Stack} title="Active clubs" value={`${data.activeClubs} / ${data.clubs}`} />
        <StatCard icon={CalendarBlank} title="Events published" value={data.publishedEvents} />
        <StatCard
          icon={Timer}
          title="Quiet days"
          value={data.clock?.status === "paused" ? "Paused" : (data.clock?.inactiveDays ?? 0)}
          hint={lead.examPauseUntil && data.clock?.status === "paused" ? `Exams till ${day(lead.examPauseUntil)}` : "Check-in at 60"}
        />
      </div>

      {data.nextGoal ? (
        <ListGroup title={`Next: ${data.nextGoal.tier}`}>
          {progress.map((p) => (
            <ListRow
              key={p.key}
              label={p.label}
              sublabel={<progress className="mt-1 h-1.5 w-full accent-primary" max={p.need} value={Math.min(p.have, p.need)} />}
              value={`${p.have} / ${p.need}`}
            />
          ))}
        </ListGroup>
      ) : (
        <div className="rounded-lg border bg-card p-4 text-sm">Gold. The top of Orbit.</div>
      )}

      <ListGroup title="Clubs on my campus" description="A club joins by requesting this campus as its parent space. Unifesto approves it.">
        {data.clubList.length ? (
          data.clubList.map((c) => (
            <ListRow
              key={c.id}
              label={c.name}
              sublabel={`Joined ${day(c.joinedAt)}`}
              value={`${c.publishedEvents} events`}
              trailing={c.publishedEvents > 0 ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Not yet</Badge>}
            />
          ))
        ) : (
          <ListRow label="No clubs yet" sublabel="Map the clubs on campus, then help the first two set up their Space." />
        )}
      </ListGroup>

      <p className="text-xs text-muted-foreground">
        <a className="hover:underline" href={`${ORBIT_URL}/terms`}>Orbit Lead Programme Terms</a>
      </p>
    </div>
  );
}
