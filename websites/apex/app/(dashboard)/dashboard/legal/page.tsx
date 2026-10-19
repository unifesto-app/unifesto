"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gavel, Plus, PencilSimple } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getLegalDocument,
  listLegalVersions,
  publishLegalDocument,
  saveLegalDraft,
  type LegalDraftInput,
  type LegalVersion,
} from "@/lib/api/legal-api";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });

type Editing = { slug: string; isNew: boolean; input: LegalDraftInput };

/** I2: draft and publish versions of the legal documents shown at unifesto.app/<slug>. */
export default function LegalDocumentsPage() {
  const [versions, setVersions] = useState<LegalVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);

  // No synchronous setState here: it runs from an effect (react-hooks/set-state-in-effect).
  const load = useCallback(
    () =>
      listLegalVersions().then(({ data, error: err }) => {
        setLoading(false);
        if (err) setError(err.message);
        else {
          setError("");
          setVersions(data ?? []);
        }
      }),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const bySlug = useMemo(() => {
    const m = new Map<string, LegalVersion[]>();
    for (const v of versions) m.set(v.slug, [...(m.get(v.slug) ?? []), v]);
    return [...m];
  }, [versions]);

  /** Opens the slug's draft, or a new draft that starts from its newest version. */
  const edit = async (slug: string, rows: LegalVersion[]) => {
    const { data, error: err } = await getLegalDocument(rows[0].id);
    if (err || !data) return setError(err?.message ?? "Couldn't open this document.");
    const draft = !data.publishedAt;
    setEditing({
      slug,
      isNew: false,
      input: {
        title: data.title,
        body: data.body,
        summary: draft ? data.summary ?? "" : "",
        requiresAcceptance: draft ? data.requiresAcceptance : false,
      },
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error: err } = await saveLegalDraft(editing.slug.trim(), editing.input);
    setSaving(false);
    if (err) return setError(err.message);
    setEditing(null);
    void load();
  };

  const publish = async (v: LegalVersion) => {
    const ask =
      `Publish version ${v.version} of "${v.title}"? It goes live at unifesto.app/${v.slug} and cannot be edited afterwards.` +
      (v.requiresAcceptance ? " Everyone it applies to will be asked to accept it on their next visit." : "");
    if (!window.confirm(ask)) return;
    const { error: err } = await publishLegalDocument(v.id);
    if (err) return setError(err.message);
    void load();
  };

  const set = (patch: Partial<LegalDraftInput>) =>
    setEditing((e) => (e ? { ...e, input: { ...e.input, ...patch } } : e));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Legal documents"
        subtitle="Draft and publish new versions. Drafts need a lawyer's review before they are published."
        actions={
          <Button
            onClick={() =>
              setEditing({ slug: "", isNew: true, input: { title: "", body: "", summary: "", requiresAcceptance: false } })
            }
          >
            <Plus className="h-4 w-4" /> New document
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : bySlug.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState icon={Gavel} title="No legal documents yet" description="Create the first one to publish it." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bySlug.map(([slug, rows]) => (
            <Card key={slug}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{rows[0].title}</p>
                    <a
                      href={`https://unifesto.app/${slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline"
                    >
                      unifesto.app/{slug}
                    </a>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => edit(slug, rows)}>
                    <PencilSimple className="h-4 w-4" />
                    {rows[0].publishedAt ? "New version" : "Edit draft"}
                  </Button>
                </div>
                <ul className="divide-y divide-border text-sm">
                  {rows.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="w-10 text-muted-foreground">v{v.version}</span>
                      {v.publishedAt ? (
                        <Badge variant="success">Published {fmt(v.publishedAt)}</Badge>
                      ) : (
                        <Badge variant="warning">Draft</Badge>
                      )}
                      {v.requiresAcceptance && <Badge variant="outline">Needs acceptance</Badge>}
                      <span className="text-muted-foreground">
                        {v._count.acceptances} {v._count.acceptances === 1 ? "acceptance" : "acceptances"}
                      </span>
                      {!v.publishedAt && (
                        <Button size="sm" className="ml-auto" onClick={() => publish(v)}>
                          Publish
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing?.isNew ? "New document" : `Draft: ${editing?.slug}`}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              {editing.isNew && (
                <div className="space-y-1.5">
                  <Label htmlFor="legal-slug">Address</Label>
                  <Input
                    id="legal-slug"
                    placeholder="acceptable-use"
                    value={editing.slug}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase() })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers and dashes. The web page at unifesto.app/{editing.slug || "…"} must exist.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="legal-title">Title</Label>
                <Input id="legal-title" value={editing.input.title} onChange={(e) => set({ title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-summary">What changed</Label>
                <Textarea
                  id="legal-summary"
                  rows={2}
                  value={editing.input.summary ?? ""}
                  onChange={(e) => set({ summary: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Shown on the accept sheet in the app and Space console.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="legal-body">Text (Markdown)</Label>
                <Textarea
                  id="legal-body"
                  rows={18}
                  className="font-mono text-xs"
                  value={editing.input.body}
                  onChange={(e) => set({ body: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Each section starts with a heading like <code>## Your account {"{#accounts}"}</code>; the part in braces is
                  its link anchor.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={editing.input.requiresAcceptance}
                  onChange={(e) => set({ requiresAcceptance: e.target.checked })}
                />
                <span>
                  Ask everyone to accept this version
                  <span className="block text-xs text-muted-foreground">
                    For material changes. The organiser agreement is only asked of Space teams.
                  </span>
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving || !editing?.slug.trim() || !editing?.input.title.trim() || !editing?.input.body.trim()}
            >
              {saving ? "Saving…" : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
