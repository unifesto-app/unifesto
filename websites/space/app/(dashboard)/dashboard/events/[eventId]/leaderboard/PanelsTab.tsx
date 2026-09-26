"use client";

import { useState } from "react";
import { Plus, Trash, Gavel, ChalkboardTeacher } from "@phosphor-icons/react";
import {
  assignPanelist,
  removePanelist,
  type LeaderboardManage,
  type Panelist,
  type PanelistKind,
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  eventId: string;
  board: LeaderboardManage;
  reload: () => void;
}

const ALL = "all";

export function PanelsTab({ eventId, board, reload }: Props) {
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PanelistKind>("JUDGE");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roundId, setRoundId] = useState<string>(ALL);
  const [entrantId, setEntrantId] = useState<string>(ALL);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const roundName = (id: string | null) =>
    id ? board.rounds.find((r) => r.id === id)?.name ?? "Unknown round" : null;
  const entrantName = (id: string | null) =>
    id ? board.entrants.find((e) => e.id === id)?.name ?? "Unknown" : null;

  const panelistLabel = (p: Panelist) =>
    p.user?.fullName || p.user?.username || "Invited panelist";

  const openAdd = () => {
    setKind("JUDGE");
    setEmail("");
    setName("");
    setRoundId(ALL);
    setEntrantId(ALL);
    setFormError("");
    setOpen(true);
  };

  const save = async () => {
    if (!email.trim()) {
      setFormError("An email is required to invite a panelist.");
      return;
    }
    setSaving(true);
    setFormError("");
    const { error } = await assignPanelist(eventId, {
      email: email.trim(),
      name: name.trim() || undefined,
      kind,
      roundId: roundId === ALL ? undefined : roundId,
      entrantId: entrantId === ALL ? undefined : entrantId,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message ?? "Could not assign the panelist.");
      return;
    }
    setOpen(false);
    reload();
  };

  const remove = async (p: Panelist) => {
    if (
      !window.confirm(
        `Remove ${panelistLabel(p)} from this panel? They lose access to score/review here.`
      )
    )
      return;
    setBusyId(p.id);
    setError("");
    const { error } = await removePanelist(eventId, p.id);
    setBusyId(null);
    if (error) setError(error.message ?? "Could not remove the panelist.");
    else reload();
  };

  const judges = board.panelists.filter((p) => p.kind === "JUDGE");
  const mentors = board.panelists.filter((p) => p.kind === "MENTOR");

  const renderRow = (p: Panelist) => {
    const scope = [roundName(p.roundId), entrantName(p.entrantId)]
      .filter(Boolean)
      .join(" · ");
    return (
      <Card key={p.id}>
        <CardContent className="flex items-center gap-3 p-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            {p.kind === "JUDGE" ? (
              <Gavel className="h-[18px] w-[18px]" weight="duotone" />
            ) : (
              <ChalkboardTeacher className="h-[18px] w-[18px]" weight="duotone" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">
              {panelistLabel(p)}
            </p>
            <p className="text-xs text-muted-foreground">
              {scope || "All rounds · all entrants"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => remove(p)}
            aria-label="Remove"
            disabled={busyId === p.id}
          >
            <Trash className="h-4 w-4 text-destructive" />
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Judges score criteria and write reviews; mentors write reviews only. Both
          score from the mobile app and never see each other&apos;s marks. Leave the
          scope unset to cover every round and entrant.
        </p>
        <Button size="sm" onClick={openAdd} className="flex-shrink-0">
          <Plus className="h-4 w-4" /> Add panelist
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {board.panelists.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No judges or mentors yet"
          description="Invite panelists by email — they get an account and a Judging section in the mobile app. Judges submit scores; mentors leave written feedback."
          action={
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add panelist
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-eyebrow">Judges ({judges.length})</h3>
            {judges.length ? (
              <div className="space-y-2">{judges.map(renderRow)}</div>
            ) : (
              <p className="text-sm text-muted-foreground">No judges assigned.</p>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="text-eyebrow">Mentors ({mentors.length})</h3>
            {mentors.length ? (
              <div className="space-y-2">{mentors.map(renderRow)}</div>
            ) : (
              <p className="text-sm text-muted-foreground">No mentors assigned.</p>
            )}
          </section>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add panelist</DialogTitle>
            <DialogDescription>
              We&apos;ll find their account by email, or create one if they&apos;re new.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKind("JUDGE")}
                  aria-pressed={kind === "JUDGE"}
                  className={[
                    "rounded-lg border p-2.5 text-left text-sm transition-colors",
                    kind === "JUDGE"
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-primary/40",
                  ].join(" ")}
                >
                  <span className="font-medium text-foreground">Judge</span>
                  <span className="block text-xs text-muted-foreground">
                    Scores + reviews
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setKind("MENTOR")}
                  aria-pressed={kind === "MENTOR"}
                  className={[
                    "rounded-lg border p-2.5 text-left text-sm transition-colors",
                    kind === "MENTOR"
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-primary/40",
                  ].join(" ")}
                >
                  <span className="font-medium text-foreground">Mentor</span>
                  <span className="block text-xs text-muted-foreground">
                    Reviews only
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="judge@example.com"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Used when creating a new account"
              />
            </div>

            {board.rounds.length > 0 && (
              <div className="space-y-1.5">
                <Label>Round scope</Label>
                <Select value={roundId} onValueChange={setRoundId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All rounds</SelectItem>
                    {board.rounds.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {board.entrants.length > 0 && (
              <div className="space-y-1.5">
                <Label>Entrant scope</Label>
                <Select value={entrantId} onValueChange={setEntrantId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All entrants</SelectItem>
                    {board.entrants.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Adding…" : "Add panelist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
