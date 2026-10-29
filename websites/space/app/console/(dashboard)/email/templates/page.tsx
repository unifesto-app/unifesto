"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Cards,
  Plus,
  PencilSimple,
  Trash,
  ArrowLeft,
  Copy,
  GlobeSimple,
} from "@unifesto/unicon/react";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type EmailTemplate,
  type TemplatePayload,
} from "@/console/lib/api/email-templates-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { EmailBodyEditor } from "@/console/components/shared/EmailBodyEditor";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

const EMPTY: TemplatePayload = { name: "", subject: "", body: "" };

/** Plain-text snippet of an HTML body, for the card preview. */
function bodySnippet(html: string, max = 120): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function SpaceEmailTemplatesPage() {
  const spaceId = useSpaceId();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState<TemplatePayload>(EMPTY);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    const { data, error } = await listTemplates(spaceId);
    if (error) setError(error.message);
    else if (data) setTemplates(data);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  // Edit an owned template, or clone a GLOBAL one into a new space template.
  const openEditOrClone = (t: EmailTemplate) => {
    setEditing(t.scope === "SPACE" ? t : null);
    setForm({
      name: t.scope === "GLOBAL" ? `${t.name} (copy)` : t.name,
      subject: t.subject,
      body: t.body,
      variables: t.variables ?? undefined,
    });
    setOpen(true);
  };

  const save = async () => {
    setError(null);
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      setError("Name, subject and body are all required.");
      return;
    }
    setSaving(true);
    const { error } = editing
      ? await updateTemplate(spaceId, editing.id, form)
      : await createTemplate(spaceId, form);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOpen(false);
    void load();
  };

  const remove = async (t: EmailTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const { error } = await deleteTemplate(spaceId, t.id);
    if (error) setError(error.message);
    else void load();
  };

  const ownedCount = templates.filter((t) => t.scope === "SPACE").length;
  const globalCount = templates.length - ownedCount;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Email"
        title="Templates"
        subtitle={
          loading
            ? "Reusable emails you can start a campaign from."
            : `${ownedCount} of your own · ${globalCount} from the global library`
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/console/email">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Campaigns
              </Link>
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" weight="bold" /> New template
            </Button>
          </div>
        }
      />

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Cards}
              tone="positive"
              title="No templates yet"
              description="Create a reusable template you can start campaigns from — great for recurring reminders and announcements."
              action={
                <Button onClick={openNew}>
                  <Plus className="mr-1.5 h-4 w-4" weight="bold" /> New template
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const isGlobal = t.scope === "GLOBAL";
            return (
              <Card key={t.id} className="card-interactive flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={
                        isGlobal
                          ? "grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                          : "grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"
                      }
                    >
                      {isGlobal ? (
                        <GlobeSimple className="h-[18px] w-[18px]" weight="duotone" />
                      ) : (
                        <Cards className="h-[18px] w-[18px]" weight="duotone" />
                      )}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={isGlobal ? "Clone into this space" : "Edit"}
                        onClick={() => openEditOrClone(t)}
                      >
                        {isGlobal ? (
                          <Copy className="h-4 w-4" />
                        ) : (
                          <PencilSimple className="h-4 w-4" />
                        )}
                      </Button>
                      {!isGlobal && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          onClick={() => remove(t)}
                        >
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium text-foreground">{t.name}</h3>
                      {isGlobal && <Badge variant="neutral">Global</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-foreground/80">
                      {t.subject}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                      {bodySnippet(t.body)}
                    </p>
                  </div>

                  <p className="text-eyebrow border-t border-border pt-3">
                    Updated {new Date(t.updatedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tname">Name</Label>
              <Input
                id="tname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Internal name, e.g. Event reminder"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tsubject">Subject</Label>
              <Input
                id="tsubject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tbody">Body</Label>
              <EmailBodyEditor
                id="tbody"
                value={form.body}
                onChange={(body) => setForm((f) => ({ ...f, body }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
