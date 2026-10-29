"use client";

import { useCallback, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle, CircleDashed, FileCsv, Trophy, WarningCircle, XCircle } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Chips, FormCard, HackPage, Toggle, hackBase, useLivePoll, useResult } from "@/console/components/hackathon/HackParts";
import { getResults, getResultsCsv, setRoundDecisions, updateHackathonConfig, type ResultTeam, type ScoringMode } from "@/console/lib/api/hackathon";
import { SCORING_MODE_OPTIONS, formatScore, standingLabel, topNSplit } from "@/console/lib/hackathon";

const OVERALL = "__overall__";
const teamLabel = (t: ResultTeam) => `${t.teamCode ?? "—"}  ${t.name}`;

/**
 * The curator's results (port of HackathonResultsScreen): ranking overall and
 * per round from submitted evaluations only, a "top N" advance helper, how the
 * winner is decided, sharing judges' notes, and the results CSV.
 */
export default function HackathonResultsPage() {
  const eventId = useParams().eventId as string;
  const initialRound = useSearchParams().get("round");
  const fetcher = useCallback(() => getResults(eventId), [eventId]);
  const { data, error, setError, reload } = useResult(fetcher);
  useLivePoll(() => void reload());
  const [view, setView] = useState(initialRound ?? OVERALL);
  const [topN, setTopN] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) return <HackPage eventId={eventId} title="Results" error={error} ready={false} />;

  const round = data.rounds.find((r) => r.id === view) ?? null;
  const teamHref = (teamId: string) => `${hackBase(eventId)}/results/${teamId}${round ? `?round=${round.id}` : ""}`;

  const config = async (input: { scoringMode?: ScoringMode; revealReviews?: boolean }) => {
    setBusy(true);
    const res = await updateHackathonConfig(eventId, input);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    void reload();
  };

  const setReveal = (on: boolean) => {
    if (
      on &&
      !window.confirm(
        "Share judges' notes with teams? Each team sees the written notes about its own team, without judges' names. Marks stay hidden. Teams with notes are notified."
      )
    )
      return;
    void config({ revealReviews: on });
  };

  const exportCsv = async () => {
    setBusy(true);
    const res = await getResultsCsv(eventId);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "hackathon-results.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  // Round view: teams in the round, best score first.
  const roundTeams = round
    ? data.teams
        .filter((t) => t.stage !== "CANCELLED" && t.rounds.find((p) => p.roundId === round.id)?.takesPart)
        .map((t) => ({ t, p: t.rounds.find((p) => p.roundId === round.id)! }))
        .sort((a, b) => (a.p.rank ?? Number.MAX_SAFE_INTEGER) - (b.p.rank ?? Number.MAX_SAFE_INTEGER))
    : [];

  const applyTopN = async () => {
    if (!round) return;
    const n = Number(topN);
    if (!Number.isInteger(n) || n < 1) return setError("Enter how many teams go through, like 10.");
    const split = topNSplit(
      roundTeams.map(({ t, p }) => ({ id: t.id, score: p.score })),
      n
    );
    // Teams already decided keep their decision; the server only decides the rest.
    const undecided = new Set(roundTeams.filter(({ p }) => p.standing === "PENDING").map(({ t }) => t.id));
    const kept = roundTeams.length - undecided.size;
    split.advance = split.advance.filter((id) => undecided.has(id));
    split.eliminate = split.eliminate.filter((id) => undecided.has(id));
    const unscored = roundTeams.filter(({ t, p }) => p.score == null && undecided.has(t.id)).length;
    const msg = [
      `Advance ${split.advance.length} team${split.advance.length === 1 ? "" : "s"}?`,
      `${split.advance.length} advance and ${split.eliminate.length} ${split.eliminate.length === 1 ? "is" : "are"} eliminated in ${round.name}.`,
      split.tiedAtCut ? `${split.tiedAtCut} more than ${n} because of a tie at the cut.` : "",
      unscored ? `${unscored} team${unscored === 1 ? " wasn't" : "s weren't"} evaluated and ${unscored === 1 ? "is" : "are"} eliminated.` : "",
      kept ? `${kept} team${kept === 1 ? "" : "s"} you already decided keep${kept === 1 ? "s" : ""} ${kept === 1 ? "its" : "their"} decision.` : "",
      "Every team is told. You can still change any team afterwards.",
    ]
      .filter(Boolean)
      .join(" ");
    if (!window.confirm(msg)) return;
    setBusy(true);
    const res = await setRoundDecisions(eventId, round.id, [
      ...split.advance.map((id) => ({ entrantId: id, status: "ADVANCED" as const })),
      ...split.eliminate.map((id) => ({ entrantId: id, status: "ELIMINATED" as const })),
    ]);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setTopN("");
    void reload();
  };

  const overallValue = (t: ResultTeam) => {
    const won = t.awards.filter((a) => a.published).map((a) => a.title);
    return [t.total != null ? formatScore(t.total) : "Not scored", ...won].join(" · ");
  };
  const overallIcon = (t: ResultTeam) =>
    t.awards.some((a) => a.published) ? (
      <Trophy className="h-5 w-5" weight="fill" />
    ) : t.psChangedAfterEvalAt ? (
      <WarningCircle className="h-5 w-5 text-warning" weight="fill" />
    ) : t.stage === "CANCELLED" || t.stage === "ELIMINATED" ? (
      <XCircle className="h-5 w-5 text-muted-foreground" weight="fill" />
    ) : t.total == null ? (
      <CircleDashed className="h-5 w-5 text-muted-foreground" />
    ) : (
      <CheckCircle className="h-5 w-5 text-success" weight="fill" />
    );
  // PER_ROUND ranks by the final round only; until it's judged nobody has a
  // total, so say where the earlier marks are instead of an all-blank list.
  const finalRoundName = data.rounds.find((r) => r.id === data.finalRoundId)?.name;
  const finalUnscored =
    data.scoringMode !== "CUMULATIVE" &&
    data.teams.length > 0 &&
    data.teams.every((t) => t.total == null);

  return (
    <HackPage
      eventId={eventId}
      title="Results"
      subtitle="Only submitted marks count. Rankings are a guide: you decide who advances and who wins."
      error={error}
      ready
      actions={
        <Button variant="outline" onClick={exportCsv} disabled={busy}>
          <FileCsv className="h-4 w-4" weight="fill" /> Export CSV
        </Button>
      }
    >
      <Chips options={[{ value: OVERALL, label: "Overall" }, ...data.rounds.map((r) => ({ value: r.id, label: r.name }))]} value={view} onChange={setView} />

      {!round ? (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <ListGroup
            title={
              data.scoringMode === "CUMULATIVE"
                ? "Ranking · rounds added up"
                : `Ranking · ${data.rounds.find((r) => r.id === data.finalRoundId)?.name ?? "final round"}`
            }
            description={
              finalUnscored
                ? `Nobody has marks in ${finalRoundName ?? "the final round"} yet. Open a round above to see its ranking.`
                : data.teams.some((t) => t.psChangedAfterEvalAt)
                  ? "Teams with a warning sign had their problem statement changed after they were evaluated. Their marks are kept."
                  : undefined
            }
          >
            {data.teams.length === 0 && <ListRow label="No teams yet" />}
            {data.teams.map((t) => (
              <ListRow
                key={t.id}
                icon={overallIcon(t)}
                label={`${t.rank != null ? `${t.rank}. ` : ""}${teamLabel(t)}`}
                value={t.stage === "CANCELLED" ? "Cancelled" : overallValue(t)}
                href={teamHref(t.id)}
              />
            ))}
          </ListGroup>
          <FormCard title="How the winner is decided">
            <Chips options={SCORING_MODE_OPTIONS} value={data.scoringMode} disabled={busy} onChange={(v) => v !== data.scoringMode && void config({ scoringMode: v })} />
            <p className="text-xs text-muted-foreground">Choose which rounds count on each round&apos;s page.</p>
            <Toggle
              label="Share judges' notes with teams"
              hint="Each team sees notes about its own team, without judges' names. Never marks."
              checked={data.revealReviews}
              disabled={busy}
              onChange={setReveal}
            />
            <p className="text-xs text-muted-foreground">The CSV has every team, each judge&apos;s marks per criterion, round scores, decisions, totals and awards.</p>
          </FormCard>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <ListGroup title={round.kind === "MENTORING" ? `${round.name} · mentoring` : `${round.name} · out of ${formatScore(round.maxScore)}`}>
            {roundTeams.length === 0 && <ListRow label="No teams in this round" />}
            {roundTeams.map(({ t, p }) => (
              <ListRow
                key={t.id}
                icon={
                  p.standing === "ADVANCED" ? (
                    <CheckCircle className="h-5 w-5 text-success" weight="fill" />
                  ) : p.standing === "ELIMINATED" ? (
                    <XCircle className="h-5 w-5 text-destructive" weight="fill" />
                  ) : (
                    <CircleDashed className="h-5 w-5 text-muted-foreground" />
                  )
                }
                label={`${p.rank != null ? `${p.rank}. ` : ""}${teamLabel(t)}`}
                value={
                  round.kind === "MENTORING"
                    ? `${p.evaluations.length} session${p.evaluations.length === 1 ? "" : "s"}`
                    : `${p.score != null ? formatScore(p.score) : "Not evaluated"}${round.eliminationEnabled ? ` · ${standingLabel(p.standing)}` : ""}`
                }
                href={teamHref(t.id)}
              />
            ))}
          </ListGroup>
          {round.eliminationEnabled && roundTeams.length > 0 && round.status === "CLOSED" ? (
            <FormCard title="Advance the top teams" description="Teams tied at the cut all go through. Change any single team from the round's page.">
              <div className="flex gap-2">
                <Input inputMode="numeric" placeholder="How many go through, e.g. 10" value={topN} onChange={(e) => setTopN(e.target.value)} />
                <Button onClick={applyTopN} disabled={busy || !topN}>
                  Apply
                </Button>
              </div>
            </FormCard>
          ) : !round.eliminationEnabled ? (
            <p className="text-sm text-muted-foreground">This round doesn&apos;t eliminate: every team goes on.</p>
          ) : null}
        </div>
      )}
    </HackPage>
  );
}
