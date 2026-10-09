"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { Chips, Field, FormCard, HackPage, hackBase } from "@/components/hackathon/HackParts";
import { createStatement, deleteStatement, getStatements, getThemes, updateStatement, type Statement, type Theme } from "@/lib/api/hackathon";

interface Draft {
  code: string;
  title: string;
  description: string;
  themeId: string;
  maxTeams: string;
}
const EMPTY: Draft = { code: "", title: "", description: "", themeId: "", maxTeams: "" };
const NO_THEME = "__none__";

/** Add or edit one problem statement (port of HackathonStatementEditorScreen). */
export default function StatementEditorPage() {
  const { eventId, statementId } = useParams() as { eventId: string; statementId: string };
  const isNew = statementId === "new";
  const router = useRouter();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [nextCode, setNextCode] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const listHref = `${hackBase(eventId)}/statements`;

  useEffect(() => {
    void Promise.all([getStatements(eventId), getThemes(eventId)]).then(([s, t]) => {
      if (t.ok) setThemes(t.data);
      if (!s.ok) return setError(s.message);
      setNextCode(s.data.nextCode);
      if (isNew) return setDraft(EMPTY);
      const found = s.data.statements.find((x) => x.id === statementId);
      if (!found) return setError("This problem statement no longer exists.");
      const d: Draft = {
        code: found.code,
        title: found.title,
        description: found.description,
        themeId: found.theme?.id ?? "",
        maxTeams: found.maxTeams != null ? String(found.maxTeams) : "",
      };
      initial.current = JSON.stringify(d);
      setStatement(found);
      setDraft(d);
    });
  }, [isNew, eventId, statementId]);

  const set = (patch: Partial<Draft>) => {
    setError("");
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const title = isNew ? "New problem statement" : statement?.code ?? "Problem statement";
  const back = { href: listHref, label: "Problem statements" };
  if (!draft) return <HackPage eventId={eventId} back={back} title={title} error={error} ready={false} />;

  const dirty = isNew || JSON.stringify(draft) !== initial.current;

  const save = async () => {
    if (!draft.title.trim()) return setError("Give the problem statement a title.");
    const max = draft.maxTeams.trim() ? Number(draft.maxTeams) : null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) return setError("Max teams is a whole number, at least 1. Leave it blank for no limit.");
    if (!isNew && !draft.code.trim()) return setError("A statement needs a code.");
    const body = { title: draft.title.trim(), description: draft.description.trim(), themeId: draft.themeId || null, maxTeams: max };
    setSaving(true);
    const res = isNew
      ? await createStatement(eventId, { ...body, code: draft.code.trim() || null })
      : await updateStatement(eventId, statementId, { ...body, code: draft.code.trim() });
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${statement?.code}? Only a statement no team has can be deleted. Its code can be used again.`)) return;
    setDeleting(true);
    const res = await deleteStatement(eventId, statementId);
    setDeleting(false);
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
        <Button onClick={save} disabled={!dirty || saving || deleting}>
          {saving ? "Saving…" : isNew ? "Add statement" : "Save statement"}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <FormCard
          description={`${isNew ? `Leave the code blank to use ${nextCode}. ` : ""}Teams see the code, title, problem and theme. With a limit, the statement shows as full once that many teams have it.`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code">
              <Input value={draft.code} maxLength={20} placeholder={isNew ? nextCode : ""} onChange={(e) => set({ code: e.target.value })} />
            </Field>
            <Field label="Max teams (optional)">
              <Input inputMode="numeric" value={draft.maxTeams} placeholder="No limit" onChange={(e) => set({ maxTeams: e.target.value })} />
            </Field>
          </div>
          <Field label="Title">
            <Input value={draft.title} maxLength={200} placeholder="Clean water for villages" onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="The problem">
            <Textarea
              rows={8}
              value={draft.description}
              maxLength={4000}
              placeholder="Who has the problem, what's in the way, and what a good solution does."
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
          <Field
            label="Theme"
            hint={
              themes.length
                ? "Teams taking this statement get its theme. Without one, they pick a theme themselves."
                : "No themes yet. Add them from the Themes page to group statements by domain."
            }
          >
            {themes.length > 0 && (
              <Chips
                options={[{ value: NO_THEME, label: "None" }, ...themes.map((t) => ({ value: t.id, label: t.name }))]}
                value={draft.themeId || NO_THEME}
                onChange={(v) => set({ themeId: v === NO_THEME ? "" : v })}
              />
            )}
          </Field>
        </FormCard>

        <div className="space-y-6">
          {statement && (
            <ListGroup title={`Teams · ${statement.taken}${statement.maxTeams != null ? ` of ${statement.maxTeams}` : ""}`}>
              {statement.teams.length === 0 && <ListRow label="No team has it yet" />}
              {statement.teams.map((t) => (
                <ListRow key={t.id} label={`${t.teamCode ?? "—"}  ${t.name}`} href={`${hackBase(eventId)}/teams/${t.id}`} />
              ))}
            </ListGroup>
          )}
          {!isNew && (
            <Button variant="outline" className="text-destructive" onClick={remove} disabled={saving || deleting}>
              <Trash className="h-4 w-4" weight="bold" /> {deleting ? "Deleting…" : "Delete problem statement"}
            </Button>
          )}
        </div>
      </div>
    </HackPage>
  );
}
