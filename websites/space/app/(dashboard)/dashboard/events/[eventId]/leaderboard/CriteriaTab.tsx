"use client";

import { useState } from "react";
import { Plus, Trash, PencilSimple, Ruler, Star } from "@phosphor-icons/react";
import {
  upsertMetric,
  deleteMetric,
  type LeaderboardManage,
  type LeaderboardMetric,
} from "@/lib/api/leaderboard-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  eventId: string;
  board: LeaderboardManage;
  reload: () => void;
}

const ALL_ROUNDS = "all";

/** Slug a label into a stable metric key: "Technical Merit" → "technical-merit". */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface Draft {
  key: string; // stable; empty on a fresh create (derived from label on save)
  label: string;
  weight: string;
  minValue: string;
  maxValue: string;
  isPrimary: boolean;
  roundId: string; // ALL_ROUNDS or a round id
}

const EMPTY: Draft = {
  key: "",
  label: "",
  weight: "1",
  minValue: "0",
  maxValue: "100",
  isPrimary: false,
  roundId: ALL_ROUNDS,
};

export function CriteriaTab({ eventId, board, reload }: Props) {
  const isRubric = board.mode === "RUBRIC";
  const noun = isRubric ? "criterion" : "metric";
  const [error, setError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaderboardMetric | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const roundName = (id: string | null) =>
    id ? board.rounds.find((r) => r.id === id)?.name ?? "Unknown round" : null;

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...EMPTY });
    setFormError("");
    setDialogOpen(true);
  };
  const openEdit = (m: LeaderboardMetric) => {
    setEditing(m);
    setDraft({
      key: m.key,
      label: m.label,
      weight: String(Number(m.weight)),
      minValue: String(Number(m.minValue)),
      maxValue: String(Number(m.maxValue)),
      isPrimary: m.isPrimary,
      roundId: m.roundId ?? ALL_ROUNDS,
    });
    setFormError("");
    setDialogOpen(true);
  };

  const save = async () => {
    const label = draft.label.trim();
    if (!label) {
      setFormError("A label is required.");
      return;
    }
    const key = editing ? editing.key : slugify(label);
    if (!key) {
      setFormError("Give the label at least one letter or number.");
      return;
    }
    const min = Number(draft.minValue);
    const max = Number(draft.maxValue);
    if (Number.isNaN(min) || Number.isNaN(max) || max <= min) {
      setFormError("Max must be greater than min.");
      return;
    }
    setSaving(true);
    setFormError("");
    const { error } = await upsertMetric(eventId, {
      key,
      label,
      weight: isRubric ? Number(draft.weight) || 1 : undefined,
      minValue: min,
      maxValue: max,
      isPrimary: isRubric ? undefined : draft.isPrimary,
      roundId: draft.roundId === ALL_ROUNDS ? undefined : draft.roundId,
      displayOrder: editing ? editing.displayOrder : board.metrics.length,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message ?? `Could not save the ${noun}.`);
      return;
    }
    setDialogOpen(false);
    reload();
  };

  const remove = async (m: LeaderboardMetric) => {
    if (
      !window.confirm(
        `Delete "${m.label}"? Any scores recorded against it are removed.`
      )
    )
      return;
    setError("");
    const { error } = await deleteMetric(eventId, m.id);
    if (error) setError(error.message ?? `Could not delete the ${noun}.`);
    else reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isRubric
            ? "Judges score each criterion within its range; the weighted average sets the round score."
            : "Enter one authoritative value per metric. Entrants rank by the primary metric."}{" "}
          Leave the round unset to apply a {noun} to every round.
        </p>
        <Button size="sm" onClick={openCreate} className="flex-shrink-0">
          <Plus className="h-4 w-4" /> Add {noun}
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {board.metrics.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title={`No ${noun}s yet`}
          description={
            isRubric
              ? "Add judging criteria (Technical merit, Design, Impact…) with weights and score ranges."
              : "Add the metrics you'll rank entrants by, and mark one as primary."
          }
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add {noun}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {board.metrics.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{m.label}</p>
                    {m.isPrimary && (
                      <Badge variant="brand">
                        <Star className="h-3 w-3" weight="fill" /> Primary
                      </Badge>
                    )}
                    {roundName(m.roundId) && (
                      <Badge variant="neutral">{roundName(m.roundId)}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Range {Number(m.minValue)}–{Number(m.maxValue)}
                    {isRubric ? ` · weight ${Number(m.weight)}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(m)}
                  aria-label="Edit"
                >
                  <PencilSimple className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(m)}
                  aria-label="Delete"
                >
                  <Trash className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${noun}` : `Add ${noun}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder={isRubric ? "Technical merit" : "Response time (s)"}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min</Label>
                <Input
                  type="number"
                  value={draft.minValue}
                  onChange={(e) => setDraft({ ...draft, minValue: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max</Label>
                <Input
                  type="number"
                  value={draft.maxValue}
                  onChange={(e) => setDraft({ ...draft, maxValue: e.target.value })}
                />
              </div>
            </div>

            {isRubric ? (
              <div className="space-y-1.5">
                <Label>Weight</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={draft.weight}
                  onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Relative importance in the weighted average.
                </p>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isPrimary}
                  onChange={(e) =>
                    setDraft({ ...draft, isPrimary: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border"
                />
                Primary metric (entrants are ranked by this)
              </label>
            )}

            {board.rounds.length > 0 && (
              <div className="space-y-1.5">
                <Label>Applies to</Label>
                <Select
                  value={draft.roundId}
                  onValueChange={(v) => setDraft({ ...draft, roundId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_ROUNDS}>All rounds</SelectItem>
                    {board.rounds.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : `Add ${noun}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
