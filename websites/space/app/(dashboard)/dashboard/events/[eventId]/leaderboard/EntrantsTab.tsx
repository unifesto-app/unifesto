"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash,
  PencilSimple,
  UsersThree,
  CaretDoubleUp,
  XCircle,
  ArrowCounterClockwise,
  LinkSimple,
} from "@phosphor-icons/react";
import {
  createEntrant,
  updateEntrant,
  deleteEntrant,
  setEntrantRoundStatus,
  searchRegistrants,
  type LinkableRegistration,
  type LeaderboardManage,
  type LeaderboardEntrant,
  type EntrantRoundStatus,
} from "@/lib/api/leaderboard-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const STATUS_META: Record<
  EntrantRoundStatus,
  { label: string; variant: "neutral" | "success" | "destructive" }
> = {
  PENDING: { label: "Undecided", variant: "neutral" },
  ADVANCED: { label: "Advanced", variant: "success" },
  ELIMINATED: { label: "Eliminated", variant: "destructive" },
};

/** Read a display note out of the free-form entrant meta blob, if present. */
function metaNote(meta: Record<string, unknown> | null): string {
  if (meta && typeof meta.note === "string") return meta.note;
  return "";
}

export function EntrantsTab({ eventId, board, reload }: Props) {
  const entrants = board.entrants;
  const teamNoun = board.entrantKind === "TEAM" ? "team" : "entrant";

  // The round the advance/eliminate controls act on. Default = last round, since
  // decisions usually happen on the most recent one.
  const [roundId, setRoundId] = useState<string>(
    board.rounds[board.rounds.length - 1]?.id ?? ""
  );
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeaderboardEntrant | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // Ticket link: who this entrant is, so their team sees standings on mobile.
  const [link, setLink] = useState<{ registrationId: string; label: string } | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<LinkableRegistration[]>([]);

  useEffect(() => {
    if (!dialogOpen || link || linkQuery.trim().length < 2) {
      setLinkResults([]);
      return;
    }
    const q = linkQuery.trim();
    const timer = setTimeout(async () => {
      const { data } = await searchRegistrants(eventId, q);
      setLinkResults(data ?? []);
    }, 250);
    return () => clearTimeout(timer);
  }, [dialogOpen, link, linkQuery, eventId]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setNote("");
    setLink(null);
    setLinkQuery("");
    setFormError("");
    setDialogOpen(true);
  };
  const openEdit = (e: LeaderboardEntrant) => {
    setEditing(e);
    setName(e.name);
    setNote(metaNote(e.meta));
    setLink(e.registrationId ? { registrationId: e.registrationId, label: "Linked to a ticket" } : null);
    setLinkQuery("");
    setFormError("");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setFormError(`A ${teamNoun} name is required.`);
      return;
    }
    const meta = note.trim() ? { note: note.trim() } : {};
    setSaving(true);
    setFormError("");
    const { error } = editing
      ? await updateEntrant(eventId, editing.id, {
          name: name.trim(),
          meta,
          registrationId: link?.registrationId ?? null,
        })
      : await createEntrant(eventId, {
          name: name.trim(),
          meta,
          ...(link ? { registrationId: link.registrationId } : {}),
        });
    setSaving(false);
    if (error) {
      setFormError(error.message ?? `Could not save the ${teamNoun}.`);
      return;
    }
    setDialogOpen(false);
    reload();
  };

  const remove = async (e: LeaderboardEntrant) => {
    if (
      !window.confirm(
        `Remove "${e.name}"? Their scores, reviews and standings are deleted.`
      )
    )
      return;
    setBusyId(e.id);
    setError("");
    const { error } = await deleteEntrant(eventId, e.id);
    setBusyId(null);
    if (error) setError(error.message ?? `Could not remove the ${teamNoun}.`);
    else reload();
  };

  const decide = async (e: LeaderboardEntrant, status: EntrantRoundStatus) => {
    if (!roundId) return;
    setBusyId(e.id);
    setError("");
    const { error } = await setEntrantRoundStatus(eventId, e.id, roundId, status);
    setBusyId(null);
    if (error) setError(error.message ?? "Could not update the decision.");
    else reload();
  };

  // Standings in the selected round, sorted by rank then score — the "guide"
  // the curator uses to make manual advance/eliminate calls.
  const rows = entrants
    .map((e) => {
      const er = e.entrantRounds.find((r) => r.roundId === roundId);
      return {
        entrant: e,
        status: (er?.status ?? "PENDING") as EntrantRoundStatus,
        score: er?.roundScore != null ? Number(er.roundScore) : null,
        rank: er?.rank ?? null,
      };
    })
    .sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      return (b.score ?? 0) - (a.score ?? 0);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Advancement is your call — the rank is only a guide. Decisions apply to the
          round selected here and drive what participants see.
        </p>
        <Button size="sm" onClick={openCreate} className="flex-shrink-0">
          <Plus className="h-4 w-4" /> Add {teamNoun}
        </Button>
      </div>

      {board.rounds.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Decisions for round</Label>
          <Select value={roundId} onValueChange={setRoundId}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {board.rounds.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <ErrorNotice message={error} />}

      {entrants.length === 0 ? (
        <EmptyState
          icon={UsersThree}
          title={`No ${teamNoun}s yet`}
          description={`Add the ${teamNoun}s competing on this board. You can record a project note or roster alongside each.`}
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add {teamNoun}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map(({ entrant: e, status, score, rank }) => {
            const meta = STATUS_META[status];
            const busy = busyId === e.id;
            const note = metaNote(e.meta);
            return (
              <Card key={e.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                    {rank ?? "–"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-foreground">{e.name}</p>
                      {roundId && (
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      )}
                      {!e.registrationId && !e.userId && (
                        <Badge variant="neutral">No ticket linked</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {score != null ? `Round score ${score.toFixed(2)}` : "Not scored"}
                      {note ? ` · ${note}` : ""}
                    </p>
                  </div>

                  {roundId && (
                    <div className="flex items-center gap-1.5">
                      {status !== "ADVANCED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => decide(e, "ADVANCED")}
                          disabled={busy}
                        >
                          <CaretDoubleUp className="h-3.5 w-3.5" /> Advance
                        </Button>
                      )}
                      {status !== "ELIMINATED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => decide(e, "ELIMINATED")}
                          disabled={busy}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Eliminate
                        </Button>
                      )}
                      {status !== "PENDING" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => decide(e, "PENDING")}
                          disabled={busy}
                          aria-label="Reset decision"
                        >
                          <ArrowCounterClockwise className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(e)}
                      aria-label="Edit"
                      disabled={busy}
                    >
                      <PencilSimple className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(e)}
                      aria-label="Remove"
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
            <DialogTitle>
              {editing ? `Edit ${teamNoun}` : `Add ${teamNoun}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={board.entrantKind === "TEAM" ? "Team Rocket" : "Ada Lovelace"}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Project / roster note</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Optional — members, project title, table number…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ticket</Label>
              {link ? (
                <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <LinkSimple className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate">{link.label}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setLink(null)}>
                    Unlink
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    placeholder="Search attendees by name or email"
                  />
                  {linkResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded-md border">
                      {linkResults.map((r) => (
                        <button
                          key={r.registrationId}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                          disabled={!!r.linkedTo && r.registrationId !== editing?.registrationId}
                          onClick={() =>
                            setLink({
                              registrationId: r.registrationId,
                              label: [r.name, r.email, r.groupSize ? `group of ${r.groupSize}` : null]
                                .filter(Boolean)
                                .join(" · "),
                            })
                          }
                        >
                          <span className="min-w-0 truncate">
                            {r.name}
                            {r.email ? <span className="text-muted-foreground"> · {r.email}</span> : null}
                          </span>
                          <span className="flex-shrink-0 text-xs text-muted-foreground">
                            {r.linkedTo ? `On ${r.linkedTo}` : r.groupSize ? `Group of ${r.groupSize}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Link the booking so the {teamNoun}&apos;s members see their round status in the app and get notified. A group booking covers everyone who claimed a seat.
              </p>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : `Add ${teamNoun}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
