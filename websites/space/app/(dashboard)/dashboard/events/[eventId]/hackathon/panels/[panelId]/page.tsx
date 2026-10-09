"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chips, Field, FormCard, HackPage, MultiChips, Toggle, hackBase } from "@/components/hackathon/HackParts";
import { createPanel, deletePanel, getJudges, getPanels, getRounds, updatePanel, type Judge, type Panel, type RoundRow } from "@/lib/api/hackathon";

const ANY_ROUND = "__any__";

interface Draft {
  name: string;
  roundId: string;
  memberUserIds: string[];
  location: string;
  meetingUrl: string;
  isAvailable: boolean;
}
const EMPTY: Draft = { name: "", roundId: ANY_ROUND, memberUserIds: [], location: "", meetingUrl: "", isAvailable: true };

/** Add or edit a panel: its judges, the round it serves, and where teams find it (port of HackathonPanelEditorScreen). */
export default function PanelEditorPage() {
  const { eventId, panelId } = useParams() as { eventId: string; panelId: string };
  const isNew = panelId === "new";
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const listHref = `${hackBase(eventId)}/judges`;

  useEffect(() => {
    void getJudges(eventId).then((r) => r.ok && setJudges(r.data));
    void getRounds(eventId).then((r) => r.ok && setRounds(r.data));
    if (isNew) return;
    void getPanels(eventId).then((r) => {
      const found = r.ok ? r.data.find((p) => p.id === panelId) : undefined;
      if (!found) return setError("This panel no longer exists.");
      const d: Draft = {
        name: found.name,
        roundId: found.round?.id ?? ANY_ROUND,
        memberUserIds: found.members.map((m) => m.userId),
        location: found.location ?? "",
        meetingUrl: found.meetingUrl ?? "",
        isAvailable: found.isAvailable,
      };
      initial.current = JSON.stringify(d);
      setPanel(found);
      setDraft(d);
    });
  }, [isNew, eventId, panelId]);

  const title = isNew ? "New panel" : panel?.name ?? "Panel";
  const back = { href: listHref, label: "Judges" };
  if (!draft) return <HackPage eventId={eventId} back={back} title={title} error={error} ready={false} />;

  const set = (patch: Partial<Draft>) => {
    setError("");
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const dirty = isNew || JSON.stringify(draft) !== initial.current;
  const panelRounds = rounds.filter((r) => r.judgingMode === "PANEL");

  const save = async () => {
    if (!draft.name.trim()) return setError('Name the panel, like "Panel A".');
    const meetingUrl = draft.meetingUrl.trim();
    if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) return setError("The call link starts with https://");
    const body = {
      name: draft.name.trim(),
      roundId: draft.roundId === ANY_ROUND ? null : draft.roundId,
      memberUserIds: draft.memberUserIds,
      location: draft.location.trim() || null,
      meetingUrl: meetingUrl || null,
      isAvailable: draft.isAvailable,
    };
    setSaving(true);
    const res = isNew ? await createPanel(eventId, body) : await updatePanel(eventId, panelId, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${panel?.name}? Only a panel with nobody in its queue can be deleted. Marks its judges gave are kept.`)) return;
    const res = await deletePanel(eventId, panelId);
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
          {saving ? "Saving…" : isNew ? "Add panel" : "Save panel"}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <FormCard>
          <Field label="Name">
            <Input value={draft.name} placeholder="Panel A" onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field
            label="Judges on the panel"
            hint={judges.length ? "A team's slot finishes once every judge on the panel has given marks." : "Add judges first, then put them on panels."}
          >
            {judges.length > 0 && (
              <MultiChips
                options={judges.map((j) => ({ value: j.userId, label: j.name || j.contact || "Judge" }))}
                value={draft.memberUserIds}
                onChange={(v) => set({ memberUserIds: v })}
              />
            )}
          </Field>
          <Field label="Round" hint={!panelRounds.length ? "Set a round to be judged by a panel for teams to pick panels." : undefined}>
            <Chips
              options={[{ value: ANY_ROUND, label: "Every panel round" }, ...panelRounds.map((r) => ({ value: r.id, label: r.name }))]}
              value={draft.roundId}
              onChange={(v) => set({ roundId: v })}
            />
          </Field>
        </FormCard>
        <FormCard title="Where teams find it">
          <Field label="Room or table (optional)">
            <Input value={draft.location} placeholder="Seminar hall" onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label="Call link for online judging (optional)">
            <Input type="url" value={draft.meetingUrl} placeholder="https://meet.google.com/…" onChange={(e) => set({ meetingUrl: e.target.value })} />
          </Field>
          <Toggle label="Taking teams" checked={draft.isAvailable} onChange={(v) => set({ isAvailable: v })} />
        </FormCard>
      </div>
      {!isNew && (
        <Button variant="outline" className="text-destructive" onClick={remove}>
          <Trash className="h-4 w-4" weight="bold" /> Delete panel
        </Button>
      )}
    </HackPage>
  );
}
