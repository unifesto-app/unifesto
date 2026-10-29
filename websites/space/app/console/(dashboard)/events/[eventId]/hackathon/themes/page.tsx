"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { HackPage, useResult } from "@/console/components/hackathon/HackParts";
import { createTheme, deleteTheme, getThemes, updateTheme, type Theme } from "@/console/lib/api/hackathon";

/** "2 statements · 5 teams" */
const usage = (t: Theme) =>
  [t.statements ? `${t.statements} statement${t.statements === 1 ? "" : "s"}` : "", t.teams ? `${t.teams} team${t.teams === 1 ? "" : "s"}` : ""]
    .filter(Boolean)
    .join(" · ") || undefined;

/**
 * Themes / domains, e.g. "HealthTech" (port of HackathonThemesScreen).
 * Statements can carry one; teams whose statement has none pick from this list.
 */
export default function HackathonThemesPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getThemes(eventId), [eventId]);
  const { data: themes, error, setError, reload } = useResult(fetcher);
  /** The theme being renamed; null = the field adds a new one. */
  const [editing, setEditing] = useState<Theme | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEditing(null);
    setName("");
    setError("");
  };

  const save = async () => {
    if (!name.trim()) return setError('Name the theme, like "HealthTech".');
    setBusy(true);
    const res = editing ? await updateTheme(eventId, editing.id, name.trim()) : await createTheme(eventId, name.trim());
    setBusy(false);
    if (!res.ok) return setError(res.message);
    reset();
    void reload();
  };

  const remove = async (t: Theme) => {
    const msg = t.statements
      ? `Delete ${t.name}? ${t.statements} statement${t.statements === 1 ? "" : "s"} lose${t.statements === 1 ? "s" : ""} this theme, and teams taking ${
          t.statements === 1 ? "it" : "them"
        } pick one themselves. A theme a team has can't be deleted.`
      : `Delete ${t.name}? A theme a team has can't be deleted.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    const res = await deleteTheme(eventId, t.id);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    reset();
    void reload();
  };

  return (
    <HackPage eventId={eventId} title="Themes" subtitle="Domains like HealthTech or FinTech. Themes are just names." error={error} ready={!!themes}>
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input value={name} maxLength={60} placeholder={editing ? `Rename ${editing.name}` : "Add a theme, e.g. HealthTech"} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={busy}>
          {editing ? "Rename" : "Add"}
        </Button>
        {editing && (
          <Button type="button" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        )}
      </form>
      {themes &&
        (themes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No themes yet. Without any, teams skip the theme when they choose a statement.</p>
        ) : (
          <ListGroup title="Themes">
            {themes.map((t) => (
              <div key={t.id} className="flex items-center gap-2 pr-3">
                <div className="min-w-0 flex-1">
                  <ListRow label={t.name} value={usage(t) ?? "Not used yet"} />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(t);
                    setName(t.name);
                    setError("");
                  }}
                >
                  Rename
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void remove(t)}>
                  Delete
                </Button>
              </div>
            ))}
          </ListGroup>
        ))}
    </HackPage>
  );
}
