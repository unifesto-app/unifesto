"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, CircleDashed, EyeSlash, Trash } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Textarea } from "@/console/components/ui/textarea";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Field, FormCard, HackPage, hackBase } from "@/console/components/hackathon/HackParts";
import { createAward, deleteAward, getAwards, unpublishAward, updateAward, type Award, type AwardsList } from "@/console/lib/api/hackathon";

interface Draft {
  title: string;
  entrantId: string;
  notes: string;
}
const EMPTY: Draft = { title: "", entrantId: "", notes: "" };

/** Declare or edit an award: its name, the winning team, and why it won (port of HackathonAwardEditorScreen). */
export default function AwardEditorPage() {
  const { eventId, awardId } = useParams() as { eventId: string; awardId: string };
  const isNew = awardId === "new";
  const router = useRouter();
  const [list, setList] = useState<AwardsList | null>(null);
  const [award, setAward] = useState<Award | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState(JSON.stringify(EMPTY));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const listHref = `${hackBase(eventId)}/winners`;

  useEffect(() => {
    void getAwards(eventId).then((r) => {
      if (!r.ok) return setError(r.message);
      setList(r.data);
      if (isNew) return setDraft(EMPTY);
      const found = r.data.awards.find((a) => a.id === awardId);
      if (!found) return setError("This award no longer exists.");
      const d = { title: found.title, entrantId: found.team.id, notes: found.notes ?? "" };
      setInitial(JSON.stringify(d));
      setAward(found);
      setDraft(d);
    });
  }, [isNew, eventId, awardId]);

  const teams = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = list?.teams ?? [];
    return q ? all.filter((t) => `${t.teamCode ?? ""} ${t.name}`.toLowerCase().includes(q)) : all;
  }, [list, search]);

  const title = isNew ? "New award" : award?.title ?? "Award";
  const back = { href: listHref, label: "Winners" };
  if (!draft || !list) return <HackPage eventId={eventId} back={back} title={title} error={error} ready={false} />;

  const set = (patch: Partial<Draft>) => {
    setError("");
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const dirty = isNew || JSON.stringify(draft) !== initial;
  const locked = !!award?.published;
  const picked = list.teams.find((t) => t.id === draft.entrantId) ?? (award ? award.team : null);

  const save = async () => {
    if (!draft.title.trim()) return setError('Name the award, like "Winner" or "Best design".');
    if (!draft.entrantId) return setError("Pick the winning team.");
    setSaving(true);
    const body = { title: draft.title.trim(), entrantId: draft.entrantId, notes: draft.notes.trim() || null };
    const res = isNew ? await createAward(eventId, body) : await updateAward(eventId, awardId, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  const unpublish = async () => {
    if (!window.confirm("Unpublish this award? Teams stop seeing it until you publish again. Nobody is notified.")) return;
    const res = await unpublishAward(eventId, awardId);
    if (!res.ok) return setError(res.message);
    setAward(res.data.awards.find((a) => a.id === awardId) ?? null);
    setList(res.data);
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${award?.title}? The award is removed. Nobody is notified.`)) return;
    const res = await deleteAward(eventId, awardId);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  return (
    <HackPage
      eventId={eventId}
      back={back}
      title={title}
      error={error}
      ready
      actions={
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : isNew ? "Add award" : "Save award"}
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <FormCard>
          <Field label="Award">
            <Input value={draft.title} placeholder="Winner" onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Notes (shown with the winner)">
            <Textarea
              rows={5}
              value={draft.notes}
              placeholder="Best end-to-end demo, and a pitch the jury loved."
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {award?.published && (
              <Button variant="outline" onClick={unpublish}>
                <EyeSlash className="h-4 w-4" weight="bold" /> Unpublish
              </Button>
            )}
            {!isNew && !award?.published && (
              <Button variant="outline" className="text-destructive" onClick={remove}>
                <Trash className="h-4 w-4" weight="bold" /> Delete award
              </Button>
            )}
          </div>
        </FormCard>
        <ListGroup
          title={picked ? `Team · ${picked.teamCode ?? ""} ${picked.name}`.trim() : "Pick the team"}
          description="Any team that took part can win, whatever its rank."
        >
          {locked ? (
            <ListRow label="Published: unpublish to change the team" />
          ) : (
            <>
              {list.teams.length > 8 && (
                <div className="p-3">
                  <Input value={search} placeholder="Search Team ID or name" onChange={(e) => setSearch(e.target.value)} />
                </div>
              )}
              <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {teams.map((t) => (
                  <ListRow
                    key={t.id}
                    icon={
                      t.id === draft.entrantId ? (
                        <CheckCircle className="h-5 w-5" weight="fill" />
                      ) : (
                        <CircleDashed className="h-5 w-5 text-muted-foreground" />
                      )
                    }
                    label={`${t.teamCode ?? "—"}  ${t.name}`}
                    onClick={() => set({ entrantId: t.id })}
                  />
                ))}
                {!teams.length && <ListRow label="No teams match" />}
              </div>
            </>
          )}
        </ListGroup>
      </div>
    </HackPage>
  );
}
