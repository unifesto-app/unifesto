"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, CircleDashed, PlayCircle, Plus } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { HackPage, hackBase, useResult } from "@/console/components/hackathon/HackParts";
import { getRounds, type RoundRow } from "@/console/lib/api/hackathon";
import { JUDGING_MODE_OPTIONS, roundStatusLabel } from "@/console/lib/hackathon";

/** One line of progress for a round: open rounds show evaluations and the queue, closed ones decisions. */
function roundSummary(r: RoundRow): string {
  const mode = r.kind === "MENTORING" ? "Mentoring" : JUDGING_MODE_OPTIONS.find((o) => o.value === r.judgingMode)?.label ?? "";
  if (r.status === "ACTIVE") return `${roundStatusLabel(r.status)} · ${r.evaluated}/${r.teams} evaluated${r.inQueue ? ` · ${r.inQueue} in queue` : ""}`;
  if (r.status === "CLOSED") return r.undecided ? `Closed · ${r.undecided} undecided` : "Closed";
  if (r.kind === "MENTORING") return `${mode} · ${r.requiredEvaluations} session${r.requiredEvaluations === 1 ? "" : "s"} per team`;
  return `${mode} · ${r.criteria ? `${r.criteria} criteria` : "no criteria yet"}`;
}

/** The hackathon's rounds in order (port of HackathonRoundsScreen). */
export default function HackathonRoundsPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getRounds(eventId), [eventId]);
  const { data: rounds, error } = useResult(fetcher);
  const base = `${hackBase(eventId)}/rounds`;

  return (
    <HackPage
      eventId={eventId}
      title="Rounds and criteria"
      subtitle="Open a round to let teams join judges' queues. A round that eliminates needs every team advanced or eliminated before the next round can open."
      error={error}
      ready={!!rounds}
      actions={
        <Button asChild>
          <Link href={`${base}/new`}>
            <Plus className="h-4 w-4" weight="bold" /> Add a round
          </Link>
        </Button>
      }
    >
      {rounds && (
        <ListGroup>
          {rounds.length === 0 && <ListRow label="No rounds yet" />}
          {rounds.map((r) => (
            <ListRow
              key={r.id}
              icon={
                r.status === "ACTIVE" ? (
                  <PlayCircle className="h-5 w-5 text-success" weight="fill" />
                ) : r.status === "CLOSED" ? (
                  <CheckCircle className="h-5 w-5 text-muted-foreground" weight="fill" />
                ) : (
                  <CircleDashed className="h-5 w-5" weight="bold" />
                )
              }
              label={r.name}
              value={roundSummary(r)}
              href={`${base}/${r.id}`}
            />
          ))}
        </ListGroup>
      )}
    </HackPage>
  );
}
