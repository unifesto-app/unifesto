"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, PencilSimple, Trash, Buildings, ArrowsClockwise, UsersThree } from "@unifesto/unicon/react";
import {
  listSponsors,
  createSponsor,
  updateSponsor,
  deleteSponsor,
  type Sponsor,
  type CreateSponsorPayload,
} from "@/lib/api/sponsors-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SponsorUsersDialog } from "./SponsorUsersDialog";

const EMPTY: CreateSponsorPayload = { name: "" };

export function RosterTab({ spaceId }: { spaceId: string }) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState<CreateSponsorPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [usersFor, setUsersFor] = useState<Sponsor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listSponsors(spaceId);
    if (error) setError(error.message ?? "Could not load sponsors.");
    else setSponsors(data ?? []);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (s: Sponsor) => {
    setEditing(s);
    setForm({
      name: s.name,
      logoUrl: s.logoUrl ?? undefined,
      websiteUrl: s.websiteUrl ?? undefined,
      description: s.description ?? undefined,
      contactName: s.contactName ?? undefined,
      contactEmail: s.contactEmail ?? undefined,
      contactPhone: s.contactPhone ?? undefined,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError("A sponsor name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const { error } = editing
      ? await updateSponsor(spaceId, editing.id, form)
      : await createSponsor(spaceId, form);
    setSaving(false);
    if (error) {
      setFormError(error.message ?? "Could not save the sponsor.");
      return;
    }
    setDialogOpen(false);
    load();
  };

  const remove = async (s: Sponsor) => {
    if (
      !window.confirm(
        `Remove "${s.name}" from the roster? This also removes it from every event and deletes its captured leads.`
      )
    )
      return;
    const { error } = await deleteSponsor(spaceId, s.id);
    if (error) setError(error.message ?? "Could not delete the sponsor.");
    else load();
  };

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sponsors.length} sponsor{sponsors.length === 1 ? "" : "s"} in your roster
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} aria-label="Refresh">
            <ArrowsClockwise className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add sponsor
          </Button>
        </div>
      </div>

      {error && <ErrorNotice message={error} />}

      {sponsors.length === 0 ? (
        <EmptyState
          icon={Buildings}
          title="No sponsors yet"
          description="Add a sponsor once and attach it to as many events as you like."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add sponsor
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sponsors.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.logoUrl}
                      alt={`${s.name} logo`}
                      className="h-12 w-12 rounded-md object-contain bg-white"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-soft text-sm font-bold text-primary">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{s.name}</p>
                    {s.websiteUrl && (
                      <a
                        href={s.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-xs text-primary hover:underline"
                      >
                        {s.websiteUrl.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                </div>

                {s.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{s.description}</p>
                )}

                <div className="mt-auto flex items-center justify-between pt-1">
                  <Badge variant="neutral">
                    {s._count?.eventSponsors ?? 0} event
                    {(s._count?.eventSponsors ?? 0) === 1 ? "" : "s"}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setUsersFor(s)}
                      aria-label="Portal access"
                      title="Portal access"
                    >
                      <UsersThree className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Edit">
                      <PencilSimple className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(s)} aria-label="Delete">
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit sponsor" : "Add sponsor"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Corp"
              />
            </Field>
            <Field label="Logo URL">
              <Input
                value={form.logoUrl ?? ""}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                placeholder="https://…/logo.png"
              />
            </Field>
            <Field label="Website">
              <Input
                value={form.websiteUrl ?? ""}
                onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                placeholder="https://acme.com"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="A short line shown on the public event page."
                rows={2}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Contact name">
                <Input
                  value={form.contactName ?? ""}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                />
              </Field>
              <Field label="Contact email">
                <Input
                  type="email"
                  value={form.contactEmail ?? ""}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Contact phone">
              <Input
                value={form.contactPhone ?? ""}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              />
            </Field>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add sponsor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SponsorUsersDialog
        spaceId={spaceId}
        sponsor={usersFor}
        open={!!usersFor}
        onOpenChange={(v) => !v && setUsersFor(null)}
      />
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
