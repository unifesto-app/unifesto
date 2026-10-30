"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cards, Plus, PencilSimple, Trash, ArrowLeft } from "@unifesto/unicon/react";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type EmailTemplate,
  type TemplatePayload,
} from "@/lib/api/email-templates-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EMPTY: TemplatePayload = { name: "", subject: "", body: "" };

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState<TemplatePayload>(EMPTY);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listTemplates();
    if (error) setError(error.message);
    else if (data) setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (t: EmailTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
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
      ? await updateTemplate(editing.id, form)
      : await createTemplate(form);
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
    const { error } = await deleteTemplate(t.id);
    if (error) setError(error.message);
    else void load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Email templates"
        subtitle="The global library. Every space can start a campaign from these."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/email">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Campaigns
              </Link>
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> New template
            </Button>
          </div>
        }
      />

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Cards}
          title="No templates yet"
          description="Create a reusable template that spaces and platform campaigns can start from."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> New template
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-foreground">{t.name}</h3>
                  <div className="flex gap-1">
                    <Button aria-label="Edit" variant="ghost" size="icon" onClick={() => openEdit(t)}>
                      <PencilSimple className="h-4 w-4" />
                    </Button>
                    <Button aria-label="Delete" variant="ghost" size="icon" onClick={() => remove(t)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{t.subject}</p>
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(t.updatedAt).toLocaleDateString("en-IN")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tname">Name</Label>
              <Input
                id="tname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Internal name, e.g. Event reminder"
              />
            </div>
            <div>
              <Label htmlFor="tsubject">Subject</Label>
              <Input
                id="tsubject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="tbody">Body (HTML)</Label>
                <span className="text-xs text-muted-foreground">
                  Merge vars: {"{{firstName}}"}, {"{{name}}"}, {"{{email}}"}
                </span>
              </div>
              <Textarea
                id="tbody"
                rows={12}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="font-mono text-xs"
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
