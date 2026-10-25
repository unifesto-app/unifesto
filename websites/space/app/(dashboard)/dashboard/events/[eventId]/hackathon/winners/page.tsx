"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Megaphone, Plus, Trophy } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { HackPage, hackBase, useResult } from "@/components/hackathon/HackParts";
import { getAwards, publishAwards } from "@/lib/api/hackathon";

/**
 * Winners (port of HackathonWinnersScreen): awards the curator declares for any
 * team, whatever its rank, then publishes. Co-Curators see the list read-only.
 */
export default function HackathonWinnersPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getAwards(eventId), [eventId]);
  const { data, setData, error, setError } = useResult(fetcher);
  const [busy, setBusy] = useState(false);
  const base = hackBase(eventId);

  if (!data) return <HackPage eventId={eventId} title="Winners" error={error} ready={false} />;

  const unpublished = data.awards.filter((a) => !a.published);

  const publish = async () => {
    const list = unpublished.map((a) => `${a.title}: ${a.team.teamCode ?? a.team.name}`).join("\n");
    if (
      !window.confirm(
        `Publish ${unpublished.length} award${unpublished.length === 1 ? "" : "s"}?\n\n${list}\n\nWinning teams hear "You won", every other team and all judges hear the winners are out.`
      )
    )
      return;
    setBusy(true);
    // Only the awards shown in the confirm, not any another curator added since.
    const res = await publishAwards(eventId, unpublished.map((a) => a.id));
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
  };

  return (
    <HackPage
      eventId={eventId}
      title="Winners"
      subtitle={
        data.canDeclareWinners
          ? "Pick any team, whatever its rank, and say why it won. Teams see awards and notes once you publish."
          : "Only the Curator or a Space Admin can declare and publish winners."
      }
      error={error}
      ready
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`${base}/results`}>See results</Link>
          </Button>
          {data.canDeclareWinners && unpublished.length > 0 && (
            <Button onClick={publish} disabled={busy}>
              <Megaphone className="h-4 w-4" weight="fill" /> Publish {unpublished.length} award{unpublished.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      }
    >
      <ListGroup title="Awards">
        {data.awards.length === 0 && <ListRow label="No awards yet" />}
        {data.awards.map((a) => (
          <ListRow
            key={a.id}
            icon={<Trophy className={a.published ? "h-5 w-5" : "h-5 w-5 text-muted-foreground"} weight="fill" />}
            label={`${a.title} · ${a.team.teamCode ?? ""} ${a.team.name}`.trim()}
            value={a.team.cancelled ? "Team cancelled" : a.published ? "Published" : "Not published"}
            href={data.canDeclareWinners ? `${base}/winners/${a.id}` : undefined}
          />
        ))}
        {data.canDeclareWinners && <ListRow icon={<Plus className="h-5 w-5" weight="bold" />} label="Add an award" href={`${base}/winners/new`} />}
      </ListGroup>
    </HackPage>
  );
}
