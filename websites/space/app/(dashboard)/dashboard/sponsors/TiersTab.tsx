"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, PencilSimple, Trash, Stack } from "@phosphor-icons/react";
import {
  listTiers,
  createTier,
  updateTier,
  deleteTier,
  type SponsorTier,
  type CreateTierPayload,
} from "@/lib/api/sponsors-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

const EMPTY: CreateTierPayload = { name: "", rank: 0, color: "" };

export function TiersTab({ spaceId }: { spaceId: string }) {
  const [tiers, setTiers] = useState<SponsorTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorTier | null>(null);
  const [form, setForm] = useState<CreateTierPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listTiers(spaceId);
    if (error) setError(error.message ?? "Could not load tiers.");
    else setTiers(data ?? []);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, rank: tiers.length });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (t: SponsorTier) => {
    setEditing(t);
    setForm({ name: t.name, rank: t.rank, color: t.color ?? "" });
    setFormError(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError("A tier name is required.");
      return;
    }
    const payload: CreateTierPayload = {
      name: form.name,
      rank: form.rank ?? 0,
      // Empty colour → omit, so the backend stores null rather than "".
      ...(form.color ? { color: form.color } : {}),
    };
    setSaving(true);
    setFormError(null);
    const { error } = editing
      ? await updateTier(spaceId, editing.id, payload)
      : await createTier(spaceId, payload);
    setSaving(false);
    if (error) {
      setFormError(error.message ?? "Could not save the tier.");
      return;
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (t: SponsorTier) => {
    if (
      !window.confirm(
        `Delete the "${t.name}" tier? Sponsors ranked in it stay attached to their events but lose the tier badge.`
      )
    )
      return;
    const { error } = await deleteTier(spaceId, t.id);
    if (error) setError(error.message ?? "Could not delete the tier.");
    else load();
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Rank order runs top (rank 0, most prominent) to bottom.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add tier
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {tiers.length === 0 ? (
        <EmptyState
          icon={Stack}
          title="No tiers yet"
          description="Tiers (Platinum, Gold, …) group and order sponsors on your event pages. Optional — sponsors without a tier still show."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add tier
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {tiers.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <span
                  className="h-8 w-8 flex-shrink-0 rounded-md border"
                  style={{ backgroundColor: t.color ?? "hsl(var(--muted))" }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Rank {t.rank}
                    {t.color ? ` · ${t.color}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label="Edit">
                  <PencilSimple className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(t)} aria-label="Delete">
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
            <DialogTitle>{editing ? "Edit tier" : "Add tier"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Platinum"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rank</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.rank ?? 0}
                  onChange={(e) => setForm({ ...form, rank: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color || "#888888"}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                    aria-label="Tier colour"
                  />
                  <Input
                    value={form.color ?? ""}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    placeholder="#C0C0C0"
                  />
                </div>
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add tier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
