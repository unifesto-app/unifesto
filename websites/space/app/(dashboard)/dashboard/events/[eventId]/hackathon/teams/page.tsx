"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { MagnifyingGlass, UsersThree } from "@unifesto/unicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { Chips, HackPage, hackBase, useResult } from "@/components/hackathon/HackParts";
import { getTeams } from "@/lib/api/hackathon";
import { joinedLabel } from "@/lib/hackathon";
import { Pager, usePaged } from "@/components/shared/ListControls";

type Filter = "all" | "active" | "nops" | "noroom" | "cancelled";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "nops", label: "No statement" },
  { value: "noroom", label: "No room" },
  { value: "cancelled", label: "Cancelled" },
];

/** Every team with its Team ID, problem statement, room and who has joined (port of HackathonTeamsScreen). */
export default function HackathonTeamsPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getTeams(eventId), [eventId]);
  const { data: teams, error } = useResult(fetcher);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (teams ?? []).filter((t) => {
      if (filter === "active" && t.stage === "CANCELLED") return false;
      if (filter === "cancelled" && t.stage !== "CANCELLED") return false;
      if (filter === "noroom" && (t.room || t.stage === "CANCELLED")) return false;
      if (filter === "nops" && t.stage !== "NEEDS_PS") return false;
      if (!q) return true;
      return [t.teamCode, t.name, t.leadName, t.statement?.code, t.statement?.title].some((s) => s?.toLowerCase().includes(q));
    });
  }, [teams, query, filter]);
  const { page, setPage, totalPages, pageItems } = usePaged(shown, 50);

  return (
    <HackPage eventId={eventId} title="Teams" subtitle="Cancelled teams keep their Team ID." error={error} ready={!!teams}>
      {teams && teams.length === 0 ? (
        <EmptyState
          icon={UsersThree}
          title="No teams yet"
          description="Import your confirmed group registrations. Each becomes a team with its own Team ID."
          action={
            <Button asChild variant="outline">
              <Link href={hackBase(eventId)}>Import from the hackathon page</Link>
            </Button>
          }
        />
      ) : (
        teams && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative sm:w-80">
                <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={query} onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }} placeholder="Team ID, team or lead name" />
              </div>
              <Chips
                options={FILTERS}
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setPage(1);
                }}
              />
            </div>
            <ListGroup title={`${shown.length} of ${teams.length}`}>
              {shown.length === 0 && <ListRow label="No teams match" />}
              {pageItems.map((t) => (
                <ListRow
                  key={t.id}
                  label={
                    <>
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{t.teamCode ?? "—"}</span>
                      {t.name}
                    </>
                  }
                  sublabel={
                    t.stage === "CANCELLED"
                      ? undefined
                      : `${t.statement ? t.statement.code ?? "Own PS" : "No PS"} · ${t.room?.name ?? "No room"} · ${joinedLabel(t.joinedCount, t.groupSize)}`
                  }
                  value={t.stage === "CANCELLED" ? <Badge variant="destructive">Cancelled</Badge> : t.leadName ?? undefined}
                  href={`${hackBase(eventId)}/teams/${t.id}`}
                />
              ))}
            </ListGroup>
            <Pager page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )
      )}
    </HackPage>
  );
}
