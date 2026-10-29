"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, CircleDashed, Pause, Play, Plus, Stop, Trash, XCircle } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Chips, Field, FormCard, HackPage, Toggle, fromLocalInput, hackBase, toLocalInput, useLivePoll } from "@/console/components/hackathon/HackParts";
import {
  addCriterion,
  createRound,
  deleteCriterion,
  deleteRound,
  getRound,
  setRoundStatus,
  setTeamDecision,
  updateCriterion,
  updateRound,
  type Criterion,
  type JudgingMode,
  type RoundDetail,
  type RoundKind,
  type RoundStatus,
  type Standing,
} from "@/console/lib/api/hackathon";
import { JUDGING_MODE_OPTIONS, evalStatusLabel, roundStatusLabel, standingLabel } from "@/console/lib/hackathon";

interface Draft {
  name: string;
  kind: RoundKind;
  judgingMode: JudgingMode;
  requiredEvaluations: string;
  slotMinutes: string;
  callGraceMinutes: string;
  eliminationEnabled: boolean;
  countsTowardTotal: boolean;
  /** ISO; '' = no end time. */
  endAt: string;
  /** ISO; '' = links editable until the round closes. */
  linksCloseAt: string;
}

const EMPTY: Draft = {
  name: "",
  kind: "EVALUATION",
  judgingMode: "SINGLE",
  requiredEvaluations: "2",
  slotMinutes: "10",
  callGraceMinutes: "3",
  eliminationEnabled: true,
  countsTowardTotal: true,
  endAt: "",
  linksCloseAt: "",
};

const toDraft = (r: RoundDetail): Draft => ({
  name: r.name,
  kind: r.kind,
  judgingMode: r.judgingMode,
  // Mentoring: sessions per team (1+); several judges: evaluations (2+).
  requiredEvaluations: String(r.kind === "MENTORING" ? r.requiredEvaluations : Math.max(2, r.requiredEvaluations)),
  slotMinutes: String(r.slotMinutes),
  callGraceMinutes: String(r.callGraceMinutes),
  eliminationEnabled: r.eliminationEnabled,
  countsTowardTotal: r.countsTowardTotal,
  endAt: r.endAt ?? "",
  linksCloseAt: r.submissionsCloseAt ?? "",
});

const inThreeHours = () => new Date(Date.now() + 3 * 3600_000).toISOString();

/** Inline add/edit form for one criterion (mobile HackathonCriterionEditorScreen). */
function CriterionForm({
  eventId,
  roundId,
  criterion,
  locked,
  onDone,
}: {
  eventId: string;
  roundId: string;
  criterion: Criterion | null;
  /** Marks are in: only the name can change. */
  locked: boolean;
  onDone: (r?: RoundDetail) => void;
}) {
  const [label, setLabel] = useState(criterion?.label ?? "");
  const [maxValue, setMaxValue] = useState(String(criterion?.maxValue ?? 10));
  const [weight, setWeight] = useState(String(criterion?.weight ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const max = Number(maxValue);
    const w = Number(weight.replace(",", "."));
    if (!label.trim()) return setError('Name it, like "Innovation" or "Presentation".');
    if (!Number.isFinite(max) || max < 1 || max > 1000) return setError("The top mark is between 1 and 1000.");
    if (!Number.isFinite(w) || w < 0.1 || w > 100) return setError("The weight is between 0.1 and 100.");
    const body = { label: label.trim(), maxValue: max, weight: w };
    setBusy(true);
    const res = criterion ? await updateCriterion(eventId, roundId, criterion.id, body) : await addCriterion(eventId, roundId, body);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone(res.data);
  };

  const remove = async () => {
    if (!criterion || !window.confirm(`Delete ${criterion.label}? Only a criterion nobody has given marks for can be deleted.`)) return;
    setBusy(true);
    const res = await deleteCriterion(eventId, roundId, criterion.id);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone(res.data);
  };

  return (
    <div className="space-y-3 bg-muted/40 p-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Input value={label} placeholder="Innovation" onChange={(e) => setLabel(e.target.value)} aria-label="Name" />
        <Input inputMode="numeric" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} aria-label="Top mark" placeholder="Top mark" disabled={locked} />
        <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Weight" placeholder="Weight" disabled={locked} />
      </div>
      <p className="text-xs text-muted-foreground">
        Name, top mark, weight. Judges give 0 to the top mark; weight 2 counts twice as much as weight 1.
        {locked ? " Judges have started marking this round, so the top mark and weight are locked." : ""}
        {criterion?.allRounds ? " This criterion applies to every round." : ""}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {criterion ? "Save criterion" : "Add criterion"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        {criterion && !locked && !criterion.marked && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
            <Trash className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * One round (port of HackathonRoundScreen): how it's judged, its criteria,
 * opening and closing it, and advancing or eliminating its teams.
 */
export default function HackathonRoundPage() {
  const { eventId, roundId } = useParams() as { eventId: string; roundId: string };
  const isNew = roundId === "new";
  const router = useRouter();
  const [round, setRound] = useState<RoundDetail | null>(null);
  // The draft and its last-saved snapshot live together so a live refresh can
  // tell, in one update, whether the curator has unsaved edits to keep.
  const [form, setForm] = useState<{ draft: Draft; initial: string } | null>(
    isNew ? { draft: EMPTY, initial: JSON.stringify(EMPTY) } : null
  );
  const draft = form?.draft ?? null;
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  /** Criterion being edited: an id, "new", or null. */
  const [editingCrit, setEditingCrit] = useState<string | null>(null);
  const listHref = `${hackBase(eventId)}/rounds`;

  const apply = useCallback((r: RoundDetail, resetDraft: boolean) => {
    setRound(r);
    if (resetDraft) {
      const d = toDraft(r);
      setForm({ draft: d, initial: JSON.stringify(d) });
    }
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    const res = await getRound(eventId, roundId);
    if (!res.ok) return setError(res.message);
    // Keep the curator's unsaved edits; refresh everything else.
    const next = toDraft(res.data);
    setForm((f) => (!f || JSON.stringify(f.draft) === f.initial ? { draft: next, initial: JSON.stringify(next) } : f));
    setRound(res.data);
  }, [isNew, eventId, roundId]);

  useEffect(() => {
    void load();
  }, [load]);
  useLivePoll(() => void load(), !isNew);

  const set = (patch: Partial<Draft>) => {
    setError("");
    setForm((f) => (f ? { ...f, draft: { ...f.draft, ...patch } } : f));
  };

  const title = isNew ? "New round" : round?.name ?? "Round";
  const back = { href: listHref, label: "Rounds" };
  if (!draft) return <HackPage eventId={eventId} back={back} title={title} error={error} ready={false} />;

  const dirty = isNew || JSON.stringify(draft) !== form?.initial;
  const mentoring = draft.kind === "MENTORING";

  const save = async () => {
    const slot = Number(draft.slotMinutes);
    const grace = Number(draft.callGraceMinutes);
    const needed = Number(draft.requiredEvaluations);
    if (!draft.name.trim()) return setError('Name the round, like "Round 2" or "Finals".');
    if (!Number.isInteger(slot) || slot < 1 || slot > 240) return setError("A slot is 1 to 240 minutes.");
    if (!Number.isInteger(grace) || grace < 0 || grace > 60) return setError("The grace time is 0 to 60 minutes.");
    if (mentoring && (!Number.isInteger(needed) || needed < 1 || needed > 10)) return setError("A team can have 1 to 10 mentor sessions.");
    if (!mentoring && draft.judgingMode === "MULTI" && (!Number.isInteger(needed) || needed < 2 || needed > 10)) {
      return setError("With several judges, each team needs 2 to 10 evaluations.");
    }
    const body = {
      name: draft.name.trim(),
      kind: draft.kind,
      judgingMode: mentoring ? ("SINGLE" as const) : draft.judgingMode,
      ...(mentoring || draft.judgingMode === "MULTI" ? { requiredEvaluations: needed } : {}),
      submissionsCloseAt: draft.linksCloseAt || null,
      slotMinutes: slot,
      callGraceMinutes: grace,
      eliminationEnabled: draft.eliminationEnabled,
      countsTowardTotal: draft.countsTowardTotal,
      endAt: draft.endAt || null,
    };
    setSaving(true);
    const res = isNew ? await createRound(eventId, body) : await updateRound(eventId, roundId, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    if (isNew) router.replace(`${listHref}/${res.data.id}`);
    else apply(res.data, true);
  };

  const changeStatus = async (to: RoundStatus) => {
    if (!round) return;
    const open = round.openRequests;
    const copy: Record<RoundStatus, string> = {
      ACTIVE: `Open ${round.name}? Teams in this round can join judges' queues, and teams and judges are notified.`,
      PENDING: `Pause ${round.name}? ${
        open
          ? `${open} team${open === 1 ? " is" : "s are"} in a queue or slot. They lose their place and are told. You can open the round again.`
          : "Teams can't join queues until you open it again."
      }`,
      CLOSED: `Close ${round.name}? ${
        open
          ? `${open} team${open === 1 ? " is" : "s are"} still in a queue or slot. Closing cancels ${open === 1 ? "it" : "them"}, and judges can't change marks any more.`
          : "Judging for this round ends and judges can no longer change their marks."
      }`,
    };
    if (!window.confirm(copy[to])) return;
    setActing(true);
    const res = await setRoundStatus(eventId, roundId, to);
    setActing(false);
    if (!res.ok) return setError(res.message);
    apply(res.data, false);
  };

  const decide = async (teamId: string, status: Standing) => {
    const team = round?.teams.find((t) => t.id === teamId);
    const verb = { ADVANCED: "Advance", ELIMINATED: "Eliminate", PENDING: "Undo the decision for" }[status];
    const told = status === "PENDING" ? "" : " The team is told straight away.";
    if (!window.confirm(`${verb} ${team?.teamCode ?? ""} ${team?.name ?? "this team"}?${told}`)) return;
    const res = await setTeamDecision(eventId, roundId, teamId, status);
    if (!res.ok) return setError(res.message);
    apply(res.data, false);
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${round?.name}? Only a round nobody has been evaluated in can be deleted.`)) return;
    const res = await deleteRound(eventId, roundId);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  return (
    <HackPage
      eventId={eventId}
      back={back}
      title={title}
      subtitle={round ? `Status: ${roundStatusLabel(round.status)}` : undefined}
      error={error}
      ready
      actions={
        <div className="flex flex-wrap gap-2">
          {round &&
            (round.status !== "ACTIVE" ? (
              <Button variant="outline" onClick={() => changeStatus("ACTIVE")} disabled={acting}>
                <Play className="h-4 w-4 text-success" weight="fill" /> {round.status === "CLOSED" ? "Open again" : "Open round"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => changeStatus("PENDING")} disabled={acting}>
                  <Pause className="h-4 w-4 text-warning" weight="fill" /> Pause
                </Button>
                <Button variant="outline" className="text-destructive" onClick={() => changeStatus("CLOSED")} disabled={acting}>
                  <Stop className="h-4 w-4" weight="fill" /> Close round
                </Button>
              </>
            ))}
          {round && (
            <Button variant="outline" onClick={() => router.push(`${listHref}/${round.id}/submissions`)}>
              Project links
            </Button>
          )}
          <Button onClick={save} disabled={!dirty || saving || acting}>
            {saving ? "Saving…" : isNew ? "Add round" : "Save round"}
          </Button>
        </div>
      }
    >
      {round && (
        <div className="space-y-1 text-sm">
          {round.blockers.map((b) => (
            <p key={b.roundId} className="text-warning">
              Decide every team in {b.roundName} first: {b.teams.slice(0, 6).map((t) => t.teamCode ?? t.name).join(", ")}
              {b.teams.length > 6 ? ` and ${b.teams.length - 6} more` : ""}.
            </p>
          ))}
          {round.kind === "EVALUATION" && round.status !== "ACTIVE" && !round.criteria.length && (
            <p className="text-warning">Add at least one criterion before opening.</p>
          )}
          <p className="text-muted-foreground">
            {round.kind === "MENTORING"
              ? `Mentored by ${round.judges} mentor${round.judges === 1 ? "" : "s"}.`
              : round.judgingMode === "PANEL"
                ? `${round.panels} panel${round.panels === 1 ? "" : "s"} can take this round.`
                : `Judged by ${round.judges} judge${round.judges === 1 ? "" : "s"}.`}
            {round.openRequests ? ` ${round.openRequests} in queues now.` : ""}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <FormCard title="Round">
          <Field label="Name">
            <Input value={draft.name} placeholder="Round 2" onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Kind of round">
            <Chips
              options={[
                { value: "EVALUATION" as const, label: "Judged", hint: "Judges give marks against your criteria." },
                {
                  value: "MENTORING" as const,
                  label: "Mentoring",
                  hint: "Teams book sessions with mentors, who give written feedback. No marks, and nobody is eliminated.",
                },
              ]}
              value={draft.kind}
              onChange={(v) => set({ kind: v, ...(v === "MENTORING" ? { requiredEvaluations: "1" } : {}) })}
            />
          </Field>
          {!mentoring && (
            <Field label="How teams are judged">
              <Chips options={JUDGING_MODE_OPTIONS} value={draft.judgingMode} onChange={(v) => set({ judgingMode: v })} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {(mentoring || draft.judgingMode === "MULTI") && (
              <Field label={mentoring ? "Mentor sessions per team" : "Evaluations per team"}>
                <Input inputMode="numeric" value={draft.requiredEvaluations} onChange={(e) => set({ requiredEvaluations: e.target.value })} />
              </Field>
            )}
            <Field label="Slot length (minutes)">
              <Input inputMode="numeric" value={draft.slotMinutes} onChange={(e) => set({ slotMinutes: e.target.value })} />
            </Field>
            <Field label="Time to turn up (minutes)">
              <Input inputMode="numeric" value={draft.callGraceMinutes} onChange={(e) => set({ callGraceMinutes: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {mentoring
              ? "Mentors write their feedback during the slot. When it ends, it's due before they can call the next team."
              : "Judges mark during the slot. When it ends, marks are due before they can call the next team."}{" "}
            A called team that doesn&apos;t turn up in time can be marked a no-show.
          </p>
        </FormCard>

        <FormCard title="Rules">
          {!mentoring && (
            <>
              <Toggle
                label="Advance or eliminate teams"
                hint="Off: every team goes on to the next round."
                checked={draft.eliminationEnabled}
                onChange={(v) => set({ eliminationEnabled: v })}
              />
              <Toggle
                label="Counts toward the total"
                hint="Used when scores add up across rounds."
                checked={draft.countsTowardTotal}
                onChange={(v) => set({ countsTowardTotal: v })}
              />
            </>
          )}
          <Toggle
            label="Stop new requests at a set time"
            hint={draft.endAt ? "After this, teams can't join a queue. Teams already waiting are still evaluated; you close the round." : undefined}
            checked={!!draft.endAt}
            onChange={(on) => set({ endAt: on ? inThreeHours() : "" })}
          />
          {draft.endAt && (
            <Field label="Last requests">
              <Input type="datetime-local" value={toLocalInput(draft.endAt)} onChange={(e) => set({ endAt: fromLocalInput(e.target.value) ?? "" })} />
            </Field>
          )}
          <Toggle
            label="Lock project links at a set time"
            hint="Off: teams can change their links until the round closes."
            checked={!!draft.linksCloseAt}
            onChange={(on) => set({ linksCloseAt: on ? inThreeHours() : "" })}
          />
          {draft.linksCloseAt && (
            <Field label="Links lock">
              <Input
                type="datetime-local"
                value={toLocalInput(draft.linksCloseAt)}
                onChange={(e) => set({ linksCloseAt: fromLocalInput(e.target.value) ?? "" })}
              />
            </Field>
          )}
        </FormCard>

        {round && round.kind === "EVALUATION" && (
          <ListGroup title="Criteria" description="Judges give a mark for every criterion. A team's evaluation is the weighted total.">
            {round.criteria.map((c) =>
              editingCrit === c.id ? (
                <CriterionForm
                  key={c.id}
                  eventId={eventId}
                  roundId={roundId}
                  criterion={c}
                  locked={round.criteriaLocked}
                  onDone={(r) => {
                    setEditingCrit(null);
                    if (r) apply(r, false);
                  }}
                />
              ) : (
                <ListRow
                  key={c.id}
                  label={c.label}
                  value={`out of ${c.maxValue}${c.weight !== 1 ? ` · ×${c.weight}` : ""}${c.allRounds ? " · all rounds" : ""}`}
                  onClick={() => setEditingCrit(c.id)}
                />
              )
            )}
            {editingCrit === "new" ? (
              <CriterionForm
                eventId={eventId}
                roundId={roundId}
                criterion={null}
                locked={round.criteriaLocked}
                onDone={(r) => {
                  setEditingCrit(null);
                  if (r) apply(r, false);
                }}
              />
            ) : round.criteriaLocked ? null : (
              <ListRow icon={<Plus className="h-5 w-5" weight="bold" />} label="Add a criterion" onClick={() => setEditingCrit("new")} />
            )}
          </ListGroup>
        )}

        {round && round.teams.length > 0 && (
          <ListGroup
            title={`Teams in this round · ${round.teams.length}`}
            description={round.eliminationEnabled ? "Advance or eliminate each team. Teams are told straight away." : undefined}
          >
            {round.teams.map((t) => (
              <div key={t.id} className="flex items-center gap-2 pr-3">
                <div className="min-w-0 flex-1">
                  <ListRow
                    icon={
                      t.standing === "ADVANCED" ? (
                        <CheckCircle className="h-5 w-5 text-success" weight="fill" />
                      ) : t.standing === "ELIMINATED" ? (
                        <XCircle className="h-5 w-5 text-destructive" weight="fill" />
                      ) : (
                        <CircleDashed className="h-5 w-5 text-muted-foreground" />
                      )
                    }
                    label={`${t.teamCode ?? "—"}  ${t.name}`}
                    sublabel={`${standingLabel(t.standing)} · ${
                      t.queueStatus
                        ? evalStatusLabel(t.queueStatus)
                        : t.required > 1
                          ? `${t.evaluations}/${t.required} evaluated`
                          : t.evaluations
                            ? "Evaluated"
                            : "Not evaluated"
                    }`}
                  />
                </div>
                {round.eliminationEnabled && (
                  <select
                    aria-label="Decision"
                    value={t.standing}
                    onChange={(e) => void decide(t.id, e.target.value as Standing)}
                    className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                  >
                    <option value="PENDING">Undecided</option>
                    <option value="ADVANCED">Advance</option>
                    <option value="ELIMINATED">Eliminate</option>
                  </select>
                )}
              </div>
            ))}
          </ListGroup>
        )}
      </div>

      {round && round.status !== "ACTIVE" && (
        <Button variant="outline" className="text-destructive" onClick={remove}>
          <Trash className="h-4 w-4" weight="bold" /> Delete round
        </Button>
      )}
    </HackPage>
  );
}
