"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { DownloadSimple, LinkSimple, LockSimple } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { HackPage, StatsRow, Toggle, hackBase, useResult } from "@/console/components/hackathon/HackParts";
import { getRoundSubmissions } from "@/console/lib/api/hackathon";
import { downloadCsv } from "@/console/lib/utils/csv";

/**
 * E5: every team's project links for one round. Curators chase the teams that
 * have none (the Missing filter) and export the lot. A team's links lock once a
 * judge has scored it in this round.
 */
export default function RoundSubmissionsPage() {
  const { eventId, roundId } = useParams() as { eventId: string; roundId: string };
  const { data, error } = useResult(useCallback(() => getRoundSubmissions(eventId, roundId), [eventId, roundId]));
  const [missingOnly, setMissingOnly] = useState(false);

  const teams = data?.teams ?? [];
  const missing = teams.filter((t) => t.missing).length;
  const shown = missingOnly ? teams.filter((t) => t.missing) : teams;
  const label = (t: (typeof teams)[number]) => [t.teamCode, t.name].filter(Boolean).join(" · ") || "Team";

  const exportCsv = () =>
    downloadCsv(
      `${data?.round.name ?? "round"}-project-links.csv`,
      ["Team ID", "Team", "Links", "Notes", "Last edit", "Edited by", "Scored"],
      shown.map((t) => [
        t.teamCode ?? "",
        t.name ?? "",
        t.links.map((l) => (l.label && l.label !== l.url ? `${l.label}: ${l.url}` : l.url)).join("\n"),
        t.notes ?? "",
        t.updatedAt ? new Date(t.updatedAt).toISOString() : "",
        t.updatedBy ?? "",
        t.judged ? "Yes" : "No",
      ]),
    );

  return (
    <HackPage
      eventId={eventId}
      back={{ href: `${hackBase(eventId)}/rounds/${roundId}`, label: data?.round.name ?? "Round" }}
      title="Project links"
      subtitle={data ? `${data.round.name}: what each team handed in` : undefined}
      error={error}
      ready={!!data}
      actions={
        <Button variant="outline" onClick={exportCsv} disabled={shown.length === 0}>
          <DownloadSimple className="h-4 w-4" /> Export CSV
        </Button>
      }
    >
      <StatsRow
        stats={[
          { label: "Teams in round", value: teams.length },
          { label: "With links", value: teams.length - missing },
          { label: "Missing", value: missing },
          { label: "Scored (locked)", value: teams.filter((t) => t.judged).length },
        ]}
      />
      <Toggle
        label="Only teams with no links"
        hint="Find who still has to hand in."
        checked={missingOnly}
        onChange={setMissingOnly}
      />
      {shown.length === 0 ? (
        <EmptyState
          icon={LinkSimple}
          title={missingOnly ? "Every team has links" : "No teams in this round yet"}
          description={missingOnly ? "Nobody is missing." : "Teams show here once they take part in the round."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Links</th>
                <th className="px-3 py-2 font-medium">Last edit</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.teamId} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {label(t)}
                    {t.judged && (
                      <Badge variant="neutral" className="ml-2">
                        <LockSimple className="mr-1 h-3 w-3" /> Scored
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {t.missing ? (
                      <span className="text-warning">No links yet</span>
                    ) : (
                      <ul className="space-y-1">
                        {t.links.map((l) => (
                          <li key={l.url}>
                            <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                              {l.label || l.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {t.notes && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{t.notes}</p>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.updatedAt ? new Date(t.updatedAt).toLocaleString("en-IN") : "—"}
                    {t.updatedBy && <span className="block text-xs">by {t.updatedBy}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HackPage>
  );
}
