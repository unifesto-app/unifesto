"use client";

import { useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LinkSimple, LockOpen, WarningCircle } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Card } from "@/console/components/ui/card";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { HackPage, hackBase, useResult } from "@/console/components/hackathon/HackParts";
import { getResults, reopenJudgment } from "@/console/lib/api/hackathon";
import { formatScore, formatWhen, standingLabel } from "@/console/lib/hackathon";

/**
 * One team's results (port of HackathonResultTeamScreen): per round its score,
 * rank and decision, and every judge's submitted marks with their notes.
 */
export default function ResultTeamPage() {
  const { eventId, teamId } = useParams() as { eventId: string; teamId: string };
  const roundId = useSearchParams().get("round");
  const fetcher = useCallback(() => getResults(eventId), [eventId]);
  const { data, error, setError, reload } = useResult(fetcher);
  const back = { href: `${hackBase(eventId)}/results${roundId ? `?round=${roundId}` : ""}`, label: "Results" };
  const team = data?.teams.find((t) => t.id === teamId);

  if (!data || !team) {
    return (
      <HackPage
        eventId={eventId}
        back={back}
        title="Team results"
        error={error || (data ? "This team isn't on the hackathon any more." : "")}
        ready={false}
      />
    );
  }

  const reopen = async (judgmentId: string, judgeName: string) => {
    if (!window.confirm(`Reopen ${judgeName}'s marks? They get 5 more minutes to change them, and they're notified. You never change marks yourself.`)) return;
    const res = await reopenJudgment(eventId, judgmentId);
    if (!res.ok) return setError(res.message);
    void reload();
  };

  // The round the curator came from first, then the rest in order.
  const rounds = [...data.rounds].sort((a, b) => (a.id === roundId ? -1 : b.id === roundId ? 1 : a.order - b.order));

  return (
    <HackPage
      eventId={eventId}
      back={back}
      title={`${team.teamCode ? `${team.teamCode} · ` : ""}${team.name}`}
      subtitle={[
        team.rank != null ? `Rank ${team.rank}` : null,
        team.total != null ? `${data.scoringMode === "CUMULATIVE" ? "Total" : "Score"} ${formatScore(team.total)}` : null,
        team.stage === "CANCELLED" ? "Cancelled" : team.stage === "ELIMINATED" ? "Eliminated" : null,
        ...team.awards.map((a) => (a.published ? a.title : `${a.title} (not published)`)),
      ]
        .filter(Boolean)
        .join(" · ")}
      error={error}
      ready
    >
      {team.statement && (
        <p className="text-sm text-muted-foreground">
          {[team.statement.code, team.statement.title].filter(Boolean).join(" · ")}
          {team.statement.themeLabel ? `  (${team.statement.themeLabel})` : ""}
        </p>
      )}
      {team.psChangedAfterEvalAt && (
        <p className="flex items-center gap-1.5 text-sm text-warning">
          <WarningCircle className="h-4 w-4" weight="fill" />
          Problem statement changed after evaluation ({formatWhen(team.psChangedAfterEvalAt)}). Marks were kept.
        </p>
      )}

      {rounds.map((r) => {
        const p = team.rounds.find((x) => x.roundId === r.id)!;
        if (!p.takesPart && !p.evaluations.length) return null;
        const mentoring = r.kind === "MENTORING";
        const title = [
          r.name,
          mentoring
            ? `${p.evaluations.length} mentor session${p.evaluations.length === 1 ? "" : "s"}`
            : p.score != null
              ? `${formatScore(p.score)} of ${formatScore(r.maxScore)}`
              : "not evaluated",
          p.rank != null ? `#${p.rank}` : null,
          r.eliminationEnabled ? standingLabel(p.standing) : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <section key={r.id} className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {p.links.length > 0 && (
              <ListGroup>
                {p.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="block">
                    <ListRow icon={<LinkSimple className="h-5 w-5" weight="bold" />} label={l.label} sublabel={l.url} />
                  </a>
                ))}
              </ListGroup>
            )}
            {p.linksNotes && <p className="text-sm text-muted-foreground">{p.linksNotes}</p>}
            {p.evaluations.length === 0 && (
              <p className="text-sm text-muted-foreground">{mentoring ? "No mentor feedback yet." : "No submitted marks yet."}</p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {p.evaluations.map((ev) => (
                <Card key={ev.judgmentId} className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{ev.judgeName}</p>
                    {!mentoring && <p className="font-display text-lg text-foreground">{formatScore(ev.total)}</p>}
                  </div>
                  {r.criteria.map((c) => {
                    const m = ev.marks.find((x) => x.metricId === c.id);
                    return (
                      <div key={c.id}>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {c.label}
                            {c.weight !== 1 ? ` ×${c.weight}` : ""}
                          </span>
                          <span className="tabular-nums text-foreground">
                            {m ? formatScore(m.value) : "–"} / {formatScore(c.maxValue)}
                          </span>
                        </div>
                        {m?.comment && <p className="mt-0.5 text-xs text-muted-foreground">{m.comment}</p>}
                      </div>
                    );
                  })}
                  {ev.review && <p className="whitespace-pre-line text-sm text-foreground">{ev.review}</p>}
                  <p className="text-xs text-muted-foreground">
                    Submitted {formatWhen(ev.submittedAt)} · {ev.locked ? "locked" : "judge can still edit"}
                  </p>
                  {ev.locked && r.status === "ACTIVE" && (
                    <Button size="sm" variant="outline" onClick={() => void reopen(ev.judgmentId, ev.judgeName)}>
                      <LockOpen className="h-4 w-4" weight="fill" /> Reopen for 5 minutes
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">Marks are never shown to teams. Notes are shared only if you turn on sharing judges&apos; notes.</p>
    </HackPage>
  );
}
