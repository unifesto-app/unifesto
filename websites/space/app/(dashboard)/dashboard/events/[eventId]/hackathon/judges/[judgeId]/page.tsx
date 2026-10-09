"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chips, Field, FormCard, HackPage, MultiChips, Toggle, hackBase } from "@/components/hackathon/HackParts";
import { addJudge, getJudge, getRounds, getThemes, removeJudge, updateJudge, type Judge, type RoundRow, type Theme } from "@/lib/api/hackathon";

const ALL_ROUNDS = "__all__";

interface Draft {
  by: "mobile" | "email";
  contact: string;
  name: string;
  themeIds: string[];
  /** Empty = every round. */
  roundIds: string[];
  location: string;
  meetingUrl: string;
  isAvailable: boolean;
}

const EMPTY: Draft = { by: "mobile", contact: "", name: "", themeIds: [], roundIds: [], location: "", meetingUrl: "", isAvailable: true };

const toDraft = (j: Judge): Draft => ({
  by: "mobile",
  contact: "",
  name: j.name ?? "",
  themeIds: j.themes.map((t) => t.id),
  roundIds: j.rounds?.map((r) => r.id) ?? [],
  location: j.location ?? "",
  meetingUrl: j.meetingUrl ?? "",
  isAvailable: j.isAvailable,
});

/**
 * Add a judge or mentor by phone number or email, or edit one (port of
 * HackathonJudgeEditorScreen): themes, rounds, where teams find them, break.
 */
export default function JudgeEditorPage() {
  const { eventId, judgeId } = useParams() as { eventId: string; judgeId: string };
  const kindParam = useSearchParams().get("kind");
  const isNew = judgeId === "new";
  const router = useRouter();
  const [judge, setJudge] = useState<Judge | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const listHref = `${hackBase(eventId)}/judges`;

  useEffect(() => {
    void getThemes(eventId).then((r) => r.ok && setThemes(r.data));
    void getRounds(eventId).then((r) => r.ok && setRounds(r.data));
    if (isNew) return;
    void getJudge(eventId, judgeId).then((r) => {
      if (!r.ok) return setError(r.message);
      const d = toDraft(r.data);
      initial.current = JSON.stringify(d);
      setJudge(r.data);
      setDraft(d);
    });
  }, [isNew, eventId, judgeId]);

  const mentor = isNew ? kindParam === "MENTOR" : judge?.kind === "MENTOR";
  const role = mentor ? "mentor" : "judge";
  const title = isNew ? `Add a ${role}` : judge?.name || judge?.contact || (mentor ? "Mentor" : "Judge");
  const back = { href: listHref, label: "Judges" };
  if (!draft) return <HackPage eventId={eventId} back={back} title={title} error={error} ready={false} />;

  const set = (patch: Partial<Draft>) => {
    setError("");
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const dirty = isNew || JSON.stringify(draft) !== initial.current;

  const save = async () => {
    const meetingUrl = draft.meetingUrl.trim();
    if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) return setError("The call link starts with https://");
    const fields = {
      themeIds: draft.themeIds,
      roundIds: draft.roundIds.length ? draft.roundIds : null,
      location: draft.location.trim() || null,
      meetingUrl: meetingUrl || null,
    };
    if (isNew) {
      const contact = draft.contact.trim();
      if (!contact) return setError(draft.by === "mobile" ? "Enter their phone number." : "Enter their email.");
      setSaving(true);
      const res = await addJudge(eventId, {
        ...fields,
        ...(draft.by === "mobile" ? { mobile: contact } : { email: contact }),
        name: draft.name.trim() || undefined,
        kind: mentor ? "MENTOR" : "JUDGE",
      });
      setSaving(false);
      if (!res.ok) return setError(res.message);
      return router.push(listHref);
    }
    setSaving(true);
    const res = await updateJudge(eventId, judgeId, { ...fields, isAvailable: draft.isAvailable });
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  const remove = async () => {
    const msg = mentor ? "They stop mentoring at this hackathon. Feedback they gave is kept." : "They stop judging this hackathon. Marks they already gave are kept.";
    if (!window.confirm(`Remove ${judge?.name || `this ${role}`}? ${msg}`)) return;
    setRemoving(true);
    const res = await removeJudge(eventId, judgeId);
    setRemoving(false);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  const roundOptions = [{ value: ALL_ROUNDS, label: "Every round" }, ...rounds.map((r) => ({ value: r.id, label: r.name }))];
  const roundValue = draft.roundIds.length ? draft.roundIds : [ALL_ROUNDS];

  return (
    <HackPage
      eventId={eventId}
      back={back}
      title={title}
      error={error}
      ready
      actions={
        <Button onClick={save} disabled={!dirty || saving || removing}>
          {saving ? "Saving…" : isNew ? `Add ${role}` : `Save ${role}`}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {isNew ? (
          <FormCard
            title="Who"
            description={`If they already use Unifesto with this ${draft.by === "mobile" ? "number" : "email"}, it's their account. If not, it becomes theirs when they sign in with it. A 10-digit number is taken as Indian (+91).`}
          >
            <Chips
              options={[
                { value: "mobile" as const, label: "Phone number" },
                { value: "email" as const, label: "Email" },
              ]}
              value={draft.by}
              onChange={(v) => set({ by: v, contact: "" })}
            />
            <Field label={draft.by === "mobile" ? "Phone number" : "Email"}>
              <Input
                type={draft.by === "mobile" ? "tel" : "email"}
                value={draft.contact}
                placeholder={draft.by === "mobile" ? "98765 43210" : "judge@example.com"}
                onChange={(e) => set({ contact: e.target.value })}
              />
            </Field>
            <Field label="Name (if they're new to Unifesto)">
              <Input value={draft.name} placeholder="Dr. Asha Rao" onChange={(e) => set({ name: e.target.value })} />
            </Field>
          </FormCard>
        ) : (
          <FormCard
            description={`${judge?.contact ? `Added with ${judge.contact}. ` : ""}${judge?.signedIn ? "They've signed in." : "They haven't opened Unifesto yet."}${
              judge && (judge.queue.waiting || judge.queue.busy) ? ` ${judge.queue.waiting} waiting in their queue.` : ""
            }`}
          >
            <Toggle
              label="Taking teams"
              hint="Off = on a break: teams can't join their queue and they can't call the next team."
              checked={draft.isAvailable}
              onChange={(v) => set({ isAvailable: v })}
            />
          </FormCard>
        )}

        <FormCard title="What they take">
          <Field
            label={mentor ? "Themes they mentor" : "Themes they judge"}
            hint={
              themes.length
                ? draft.themeIds.length
                  ? "Teams with these themes can pick them. Teams that typed their own theme can pick any judge."
                  : "None picked: every team can pick them."
                : "No themes on your list, so every team can pick them."
            }
          >
            {themes.length > 0 && (
              <MultiChips options={themes.map((t) => ({ value: t.id, label: t.name }))} value={draft.themeIds} onChange={(v) => set({ themeIds: v })} />
            )}
          </Field>
          <Field label="Rounds">
            <MultiChips
              options={roundOptions}
              value={roundValue}
              onChange={(v) => {
                // "Every round" and specific rounds exclude each other.
                const added = v.find((x) => !roundValue.includes(x));
                if (added === ALL_ROUNDS || v.length === 0) return set({ roundIds: [] });
                set({ roundIds: v.filter((x) => x !== ALL_ROUNDS) });
              }}
            />
          </Field>
        </FormCard>

        <FormCard
          title="Where teams find them"
          description={`A called team sees the room, or a Join call button when there's a link.${mentor ? " Mentors only take mentoring rounds." : " Judges only take judged rounds."}`}
        >
          <Field label="Room or table (optional)">
            <Input value={draft.location} placeholder="Lab 2, table 4" onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label="Call link for online judging (optional)">
            <Input type="url" value={draft.meetingUrl} placeholder="https://meet.google.com/…" onChange={(e) => set({ meetingUrl: e.target.value })} />
          </Field>
        </FormCard>
      </div>
      {!isNew && (
        <Button variant="outline" className="text-destructive" onClick={remove} disabled={saving || removing}>
          <Trash className="h-4 w-4" weight="bold" /> {removing ? "Removing…" : `Remove ${role}`}
        </Button>
      )}
    </HackPage>
  );
}
