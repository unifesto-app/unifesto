"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowCounterClockwise, LockSimple, WarningCircle } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Textarea } from "@/console/components/ui/textarea";
import { Chips, Field, FormCard, HackPage, StatementCard, hackBase } from "@/console/components/hackathon/HackParts";
import {
  assignTeamStatement,
  getStatements,
  getTeam,
  getThemes,
  unlockTeamStatement,
  type SetStatementInput,
  type StatementList,
  type TeamDetail,
  type Theme,
} from "@/console/lib/api/hackathon";
import { formatWhen, placesLabel } from "@/console/lib/hackathon";

type Source = "LIST" | "OWN";
const SOURCES: { value: Source; label: string }[] = [
  { value: "LIST", label: "From your list" },
  { value: "OWN", label: "Write one" },
];

/**
 * The curator sets a team's problem statement and theme (port of
 * HackathonTeamStatementScreen): one from the list or written for them, in any
 * mode and after the deadline. It locks for the team straight away.
 */
export default function TeamStatementPage() {
  const { eventId, teamId } = useParams() as { eventId: string; teamId: string };
  const router = useRouter();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [list, setList] = useState<StatementList | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [source, setSource] = useState<Source>("LIST");
  const [pickedId, setPickedId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [themeId, setThemeId] = useState("");
  const [themeText, setThemeText] = useState("");
  const teamHref = `${hackBase(eventId)}/teams/${teamId}`;

  useEffect(() => {
    void Promise.all([getTeam(eventId, teamId), getStatements(eventId), getThemes(eventId)]).then(([t, s, th]) => {
      if (!t.ok) return setError(t.message);
      if (!s.ok) return setError(s.message);
      if (th.ok) setThemes(th.data);
      const cur = t.data.statement;
      setTeam(t.data);
      setList(s.data);
      // Start from what the team has, so a small correction is a small edit.
      setSource(cur?.source ?? (s.data.statements.length ? "LIST" : "OWN"));
      setPickedId(cur?.statementId ?? "");
      setTitle(cur?.source === "OWN" ? cur.title : "");
      setDescription(cur?.source === "OWN" ? cur.description : "");
      setThemeId(cur?.theme && !cur.statementId ? cur.theme.id : "");
      setThemeText(cur?.themeText ?? "");
    });
  }, [eventId, teamId]);

  const back = { href: teamHref, label: "Team" };
  if (!team || !list) return <HackPage eventId={eventId} back={back} title="Problem statement" error={error} ready={false} />;

  const cur = team.statement;
  const cancelled = team.stage === "CANCELLED";
  const picked = source === "LIST" ? list.statements.find((s) => s.id === pickedId) ?? null : null;
  const needsTheme = list.themeMode === "TEXT" ? !picked?.theme : !picked?.theme && themes.length > 0;
  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    setError("");
    fn(v);
  };

  const assign = async () => {
    const input: SetStatementInput = {};
    if (source === "LIST") {
      if (!picked) return setError("Pick a statement.");
      input.statementId = picked.id;
    } else {
      if (!title.trim()) return setError("Give the statement a title.");
      if (!description.trim()) return setError("Describe the problem.");
      input.title = title.trim();
      input.description = description.trim();
    }
    if (needsTheme) {
      if (list.themeMode === "TEXT") {
        if (!themeText.trim()) return setError("Add a theme.");
        input.themeText = themeText.trim();
      } else {
        if (!themeId) return setError("Pick a theme.");
        input.themeId = themeId;
      }
    }
    const msg = `${cur ? "Change this team's statement?" : "Assign this statement?"} ${team.teamCode ?? team.name} is notified and it's locked for them.${
      cur ? " If they were already evaluated, their marks stay and results show the change." : ""
    }`;
    if (!window.confirm(msg)) return;
    setSaving(true);
    const res = await assignTeamStatement(eventId, teamId, input);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.push(teamHref);
  };

  const unlock = async () => {
    if (
      !window.confirm(
        "Let the team choose again? Their statement and theme are cleared (freeing its place on the list) and they're notified. Until they lock one in again, they can't be judged."
      )
    )
      return;
    setUnlocking(true);
    const res = await unlockTeamStatement(eventId, teamId);
    setUnlocking(false);
    if (!res.ok) return setError(res.message);
    router.push(teamHref);
  };

  return (
    <HackPage eventId={eventId} back={back} title={team.teamCode ?? "Problem statement"} subtitle={team.name} error={error} ready>
      {cur ? (
        <div className="space-y-4">
          <p className="flex items-center gap-1.5 text-sm text-success">
            <LockSimple className="h-4 w-4" weight="fill" />
            {cur.setBy?.kind === "ORGANISER" ? "Assigned by organisers" : `Locked in${cur.setBy?.name ? ` by ${cur.setBy.name}` : ""}`}
            {cur.lockedAt ? ` · ${formatWhen(cur.lockedAt)}` : ""}
          </p>
          <StatementCard code={cur.code} title={cur.title} description={cur.description} theme={cur.themeLabel} />
          {cur.changedAfterEvalAt && (
            <p className="flex items-center gap-1.5 text-sm text-warning">
              <WarningCircle className="h-4 w-4" weight="fill" />
              Changed after evaluation ({formatWhen(cur.changedAfterEvalAt)}). Earlier marks were kept.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No problem statement yet.</p>
      )}

      {cancelled ? (
        <p className="text-sm text-muted-foreground">This team&apos;s registration was cancelled, so it can&apos;t be given a statement.</p>
      ) : (
        <FormCard title={cur ? "Change it to" : "Assign"}>
          <Chips options={SOURCES} value={source} onChange={edit(setSource)} />
          {source === "LIST" ? (
            list.statements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Your list is empty. Add statements from the Problem statements page, or write one.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {list.statements.map((s) => {
                  const mine = s.id === cur?.statementId;
                  const full = s.placesLeft === 0 && !mine;
                  return (
                    <StatementCard
                      key={s.id}
                      code={s.code}
                      title={s.title}
                      description={s.description}
                      theme={s.theme?.name}
                      note={mine ? "Current" : placesLabel(s.placesLeft)}
                      selected={s.id === pickedId}
                      disabled={full}
                      onClick={full ? undefined : () => edit(setPickedId)(s.id)}
                    />
                  );
                })}
              </div>
            )
          ) : (
            <>
              <Field label="Title">
                <Input value={title} maxLength={200} onChange={(e) => edit(setTitle)(e.target.value)} />
              </Field>
              <Field label="The problem">
                <Textarea rows={6} value={description} maxLength={4000} onChange={(e) => edit(setDescription)(e.target.value)} />
              </Field>
            </>
          )}
          {needsTheme &&
            (source === "OWN" || picked) &&
            (list.themeMode === "TEXT" ? (
              <Field label="Theme or domain">
                <Input value={themeText} maxLength={60} onChange={(e) => edit(setThemeText)(e.target.value)} />
              </Field>
            ) : (
              <Field label="Theme">
                <Chips options={themes.map((t) => ({ value: t.id, label: t.name }))} value={themeId} onChange={edit(setThemeId)} />
              </Field>
            ))}
          <div className="flex flex-wrap gap-4">
            <Button onClick={assign} disabled={saving || unlocking || (source === "LIST" && !picked)}>
              {saving ? "Saving…" : cur ? "Change and lock" : "Assign and lock"}
            </Button>
            {cur && (
              <Button variant="outline" onClick={unlock} disabled={saving || unlocking}>
                <ArrowCounterClockwise className="h-4 w-4" weight="bold" />
                {unlocking ? "Reopening…" : "Let the team choose again"}
              </Button>
            )}
          </div>
        </FormCard>
      )}
    </HackPage>
  );
}
