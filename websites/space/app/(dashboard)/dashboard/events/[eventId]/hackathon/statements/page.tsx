"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useParams } from "next/navigation";
import { GearSix, Lightbulb, Plus } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { HackPage, hackBase, useResult } from "@/components/hackathon/HackParts";
import { getStatements } from "@/lib/api/hackathon";
import { psModeSummary } from "@/lib/hackathon";

/**
 * The organisers' list of problem statements (port of HackathonStatementsScreen),
 * with how many teams took each and how statements are handed out right now.
 */
export default function HackathonStatementsPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getStatements(eventId), [eventId]);
  const { data, error } = useResult(fetcher);
  const base = hackBase(eventId);
  const needsList = data?.mode === "TEAM_PICKS" || data?.mode === "CURATOR_ASSIGNS";

  return (
    <HackPage
      eventId={eventId}
      title="Problem statements"
      error={error}
      ready={!!data}
      actions={
        <Button asChild>
          <Link href={`${base}/statements/new`}>
            <Plus className="h-4 w-4" weight="bold" /> Add statement
          </Link>
        </Button>
      }
    >
      {data && (
        <>
          <ListGroup
            description={
              data.mode === "TEAM_WRITES"
                ? `Teams write their own, so this list is optional. ${data.ownStatements} team${data.ownStatements === 1 ? " has" : "s have"} written one.`
                : data.ownStatements
                  ? `${data.ownStatements} team${data.ownStatements === 1 ? " has its" : "s have their"} own statement.`
                  : undefined
            }
          >
            <ListRow
              icon={<GearSix className="h-5 w-5" weight="fill" />}
              label="How teams get one"
              value={psModeSummary(data.mode, data.deadline)}
              href={`${base}/settings`}
            />
          </ListGroup>
          {data.statements.length === 0 ? (
            <EmptyState
              icon={Lightbulb}
              title="No problem statements yet"
              description={
                needsList
                  ? "Add the problems teams can work on. Each gets a code like PS-01, and you can limit how many teams take it."
                  : "Add problems to the list if you want to assign some teams one."
              }
            />
          ) : (
            <ListGroup title={`${data.statements.length} on the list`}>
              {data.statements.map((s) => (
                <ListRow
                  key={s.id}
                  label={
                    <>
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{s.code}</span>
                      {s.title}
                    </>
                  }
                  value={
                    [s.theme?.name, s.maxTeams != null ? `${s.taken}/${s.maxTeams}` : s.taken ? `${s.taken} team${s.taken === 1 ? "" : "s"}` : null]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  href={`${base}/statements/${s.id}`}
                />
              ))}
            </ListGroup>
          )}
        </>
      )}
    </HackPage>
  );
}
