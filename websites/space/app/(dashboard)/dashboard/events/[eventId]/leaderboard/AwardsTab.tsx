"use client";

import { useState } from "react";
import { Plus, Trash, Medal, Eye, EyeSlash } from "@phosphor-icons/react";
import {
  createAward,
  setAwardPublished,
  deleteAward,
  type LeaderboardManage,
  type Award,
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

const PRESET_TITLES = [
  "Winner",
  "Runner-up",
  "Second Runner-up",
  "Best Design",
  "Best Technical",
  "People's Choice",
];

export function AwardsTab({ eventId, board, reload }: Props) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(PRESET_TITLES[0]);
  const [entrantId, setEntrantId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const entrantName = (id: string) =>
    board.entrants.find((e) => e.id === id)?.name ?? "Unknown entrant";

  const openAdd = () => {
    // Suggest the first preset title not already used.
    const used = new Set(board.awards.map((a) => a.title));
    setTitle(PRESET_TITLES.find((t) => !used.has(t)) ?? "");
    setEntrantId(board.entrants[0]?.id ?? "");
    setFormError("");
    setOpen(true);
  };

  const save = async () => {
    if (!title.trim()) {
      setFormError("An award title is required.");
      return;
    }
    if (!entrantId) {
      setFormError("Choose the entrant receiving this award.");
      return;
    }
    setSaving(true);
    setFormError("");
    const { error } = await createAward(eventId, {
      entrantId,
      title: title.trim(),
      order: board.awards.length,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message ?? "Could not create the award.");
      return;
    }
    setOpen(false);
    reload();
  };

  const togglePublish = async (a: Award) => {
    setBusyId(a.id);
    setError("");
    const { error } = await setAwardPublished(eventId, a.id, !a.published);
    setBusyId(null);
    if (error) setError(error.message ?? "Could not update the award.");
    else reload();
  };

  const remove = async (a: Award) => {
    if (!window.confirm(`Delete the "${a.title}" award?`)) return;
    setBusyId(a.id);
    setError("");
    const { error } = await deleteAward(eventId, a.id);
    setBusyId(null);
    if (error) setError(error.message ?? "Could not delete the award.");
    else reload();
  };

  const noEntrants = board.entrants.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Declare named awards and publish them one at a time — great for a reveal.
          Published awards show to participants and on the public board.
        </p>
        <Button
          size="sm"
          onClick={openAdd}
          disabled={noEntrants}
          className="flex-shrink-0"
        >
          <Plus className="h-4 w-4" /> Add award
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {board.awards.length === 0 ? (
        <EmptyState
          icon={Medal}
          title="No awards yet"
          description={
            noEntrants
              ? "Add entrants first, then declare awards (Winner, Best Design, People's Choice…) and publish them when you're ready."
              : "Declare awards (Winner, Best Design, People's Choice…) and publish them when you're ready to reveal."
          }
          tone="positive"
          action={
            !noEntrants && (
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add award
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {board.awards.map((a) => {
            const busy = busyId === a.id;
            return (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-success-soft text-success">
                    <Medal className="h-[18px] w-[18px]" weight="duotone" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{a.title}</p>
                      <Badge variant={a.published ? "success" : "neutral"}>
                        {a.published ? "Published" : "Hidden"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {entrantName(a.entrantId)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => togglePublish(a)}
                    disabled={busy}
                  >
                    {a.published ? (
                      <>
                        <EyeSlash className="h-3.5 w-3.5" /> Unpublish
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Publish
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(a)}
                    aria-label="Delete"
                    disabled={busy}
                  >
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add award</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Winner"
                list="award-title-presets"
              />
              <datalist id="award-title-presets">
                {PRESET_TITLES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>
                Awarded to <span className="text-destructive">*</span>
              </Label>
              <Select value={entrantId} onValueChange={setEntrantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an entrant" />
                </SelectTrigger>
                <SelectContent>
                  {board.entrants.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Add award"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
