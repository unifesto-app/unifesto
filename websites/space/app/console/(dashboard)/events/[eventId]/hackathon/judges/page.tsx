"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatsCircle, Coffee, Gavel, Plus, UsersFour } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { HackPage, hackBase, useResult } from "@/console/components/hackathon/HackParts";
import { getJudges, getPanels, type Judge, type Panel } from "@/console/lib/api/hackathon";

/** What a judge row says on the right: their queue, a break, or who they take. */
function judgeSummary(j: Judge): string {
  if (!j.isAvailable) return "On a break";
  if (j.queue.busy || j.queue.waiting) return `${j.queue.busy ? "In a slot" : "Free"} · ${j.queue.waiting} waiting`;
  const bits = [j.themes.length ? j.themes.map((t) => t.name).join(", ") : "Any theme"];
  if (!j.signedIn) bits.push("not signed in yet");
  return bits.join(" · ");
}

const plus = <Plus className="h-5 w-5" weight="bold" />;

/** Judges, mentors and panels with their queues at a glance (port of HackathonJudgesScreen). */
export default function HackathonJudgesPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getJudges(eventId), [eventId]);
  const { data: judges, error } = useResult(fetcher);
  const [panels, setPanels] = useState<Panel[]>([]);
  const base = hackBase(eventId);

  useEffect(() => {
    void getPanels(eventId).then((p) => p.ok && setPanels(p.data));
  }, [eventId]);

  const onlyJudges = (judges ?? []).filter((j) => j.kind !== "MENTOR");
  const mentors = (judges ?? []).filter((j) => j.kind === "MENTOR");

  return (
    <HackPage
      eventId={eventId}
      title="Judges, mentors and panels"
      error={error}
      ready={!!judges}
      actions={
        <Button asChild variant="outline">
          <Link href={`${base}/queues`}>Live queues</Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <ListGroup
          title={`Judges · ${onlyJudges.length}`}
          description="Add judges by phone number or email. They sign in to Unifesto as usual and find the judge console under Judging. They see team names, problem statements and project links, never contact details."
        >
          {onlyJudges.length === 0 && <ListRow label="No judges yet" />}
          {onlyJudges.map((j) => (
            <ListRow
              key={j.id}
              icon={
                j.isAvailable ? <Gavel className="h-5 w-5" weight="fill" /> : <Coffee className="h-5 w-5 text-muted-foreground" weight="fill" />
              }
              label={j.name || j.contact || "Judge"}
              value={judgeSummary(j)}
              href={`${base}/judges/${j.id}`}
            />
          ))}
          <ListRow icon={plus} label="Add a judge" href={`${base}/judges/new`} />
        </ListGroup>

        <ListGroup
          title={`Mentors · ${mentors.length}`}
          description="Mentors take mentoring rounds: teams book a session and get written feedback. Mentors never give marks."
        >
          {mentors.map((j) => (
            <ListRow
              key={j.id}
              icon={
                j.isAvailable ? (
                  <ChatsCircle className="h-5 w-5" weight="fill" />
                ) : (
                  <Coffee className="h-5 w-5 text-muted-foreground" weight="fill" />
                )
              }
              label={j.name || j.contact || "Mentor"}
              value={judgeSummary(j)}
              href={`${base}/judges/${j.id}`}
            />
          ))}
          <ListRow icon={plus} label="Add a mentor" href={`${base}/judges/new?kind=MENTOR`} />
        </ListGroup>

        <ListGroup
          title="Panels"
          description="Panels are for rounds judged by a panel: the judges sit together, each team gets one slot, and every judge on the panel gives marks."
        >
          {panels.map((p) => (
            <ListRow
              key={p.id}
              icon={<UsersFour className={p.isAvailable ? "h-5 w-5" : "h-5 w-5 text-muted-foreground"} weight="fill" />}
              label={p.name}
              value={`${p.members.length} judge${p.members.length === 1 ? "" : "s"}${p.round ? ` · ${p.round.name}` : ""}${
                p.queue.waiting ? ` · ${p.queue.waiting} waiting` : ""
              }`}
              href={`${base}/panels/${p.id}`}
            />
          ))}
          <ListRow icon={plus} label="Add a panel" href={`${base}/panels/new`} />
        </ListGroup>
      </div>
    </HackPage>
  );
}
