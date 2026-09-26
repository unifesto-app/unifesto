"use client";

import { useState } from "react";
import {
  Plus,
  Trash,
  PencilSimple,
  ArrowUp,
  ArrowDown,
  Flag,
  Play,
  Lock,
} from "@phosphor-icons/react";
import {
  createRound,
  updateRound,
  deleteRound,
  reorderRounds,
  setRoundStatus,
  type LeaderboardManage,
  type LeaderboardRound,
  type RoundStatus,
} from "@/lib/api/leaderboard-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const STATUS_META: Record<
  RoundStatus,
  { label: string; variant: "neutral" | "success" | "warning" }
> = {
  PENDING: { label: "Not started", variant: "neutral" },
  ACTIVE: { label: "Open for scoring", variant: "success" },
  CLOSED: { label: "Closed", variant: "warning" },
};

export function RoundsTab({ eventId, board, reload }: Props) {
  const rounds = board.rounds;
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaderboardRound | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openCreate = () => {
    setEditing(null);
    setName("");
    setFormError("");
    setDialogOpen(true);
  };
  const openEdit = (r: LeaderboardRound) => {
    setEditing(r);
    setName(r.name);
    setFormError("");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setFormError("A round name is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    const { error } = editing
      ? await updateRound(eventId, editing.id, { name: name.trim() })
      : await createRound(eventId, { name: name.trim() });
    setSaving(false);
    if (error) {
      setFormError(error.message ?? "Could not save the round.");
      return;
    }
    setDialogOpen(false);
    reload();
  };

  const changeStatus = async (r: LeaderboardRound, status: RoundStatus) => {
    setBusyId(r.id);
    setError("");
    const { error } = await setRoundStatus(eventId, r.id, status);
    setBusyId(null);
    if (error) setError(error.message ?? "Could not change the round status.");
    else reload();
  };

  const remove = async (r: LeaderboardRound) => {
    if (
      !window.confirm(
        `Delete "${r.name}"? All scores, reviews and standings recorded in this round are removed. This can't be undone.`
      )
    )
      return;
    setBusyId(r.id);
    setError("");
    const { error } = await deleteRound(eventId, r.id);
    setBusyId(null);
    if (error) setError(error.message ?? "Could not delete the round.");
    else reload();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rounds.length) return;
    const ids = rounds.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusyId(rounds[index].id);
    setError("");
    const { error } = await reorderRounds(eventId, ids);
    setBusyId(null);
    if (error) setError(error.message ?? "Could not reorder rounds.");
    else reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Rounds run top to bottom. Open a round to let judges score it; close it to
          lock their access. Scores are independent per round — final ranking is the
          last round.
        </p>
        <Button size="sm" onClick={openCreate} className="flex-shrink-0">
          <Plus className="h-4 w-4" /> Add round
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {rounds.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No rounds yet"
          description="Add rounds (Screening → Semis → Finals) to stage the competition. A board with a single round works fine too."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add round
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rounds.map((r, i) => {
            const meta = STATUS_META[r.status];
            const busy = busyId === r.id;
            return (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-6"
                      onClick={() => move(i, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-6"
                      onClick={() => move(i, 1)}
                      disabled={busy || i === rounds.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{r.name}</p>
                    <Badge variant={meta.variant} className="mt-0.5">
                      {meta.label}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.status !== "ACTIVE" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => changeStatus(r, "ACTIVE")}
                        disabled={busy}
                      >
                        <Play className="h-3.5 w-3.5" /> Open
                      </Button>
                    )}
                    {r.status === "ACTIVE" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => changeStatus(r, "CLOSED")}
                        disabled={busy}
                      >
                        <Lock className="h-3.5 w-3.5" /> Close
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(r)}
                      aria-label="Rename"
                      disabled={busy}
                    >
                      <PencilSimple className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(r)}
                      aria-label="Delete"
                      disabled={busy}
                    >
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Rename round" : "Add round"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Semi-finals"
                autoFocus
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Add round"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
