"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Plus, PencilSimple, Trash } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createArticle,
  deleteArticle,
  getAllArticles,
  updateArticle,
  type HelpArticle,
  type HelpArticleInput,
  type HelpArticleStatus,
} from "@/lib/api/help-api";

/** Help articles (D17): the public help centre and the Assist bot's knowledge base. */
export default function HelpArticlesPage() {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<HelpArticle | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getAllArticles();
    setLoading(false);
    if (err) setError(err.message);
    else {
      setError("");
      setArticles(data ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (a: HelpArticle) => {
    if (!window.confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    const { error: err } = await deleteArticle(a.id);
    if (err) return setError(err.message);
    setArticles((as) => as.filter((x) => x.id !== a.id));
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });

  // Keep categories the admin has already used one click away in the dialog.
  const categories = Array.from(new Set(articles.map((a) => a.category))).sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help articles"
        subtitle="Published articles appear at unifesto.app/help and answer questions in Assist."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New article
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
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={BookOpen}
              title="No help articles yet"
              description="Write your first article to publish it in the help centre."
              action={
                <Button onClick={() => setEditing("new")}>
                  <Plus className="h-4 w-4" /> New article
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {articles.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-foreground">{a.title}</p>
                  <Badge variant={a.status === "PUBLISHED" ? "success" : "warning"}>
                    {a.status === "PUBLISHED" ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {a.category} · /help/{a.slug} · Updated {fmt(a.updatedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                  <PencilSimple className="h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${a.title}`}
                  onClick={() => handleDelete(a)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ArticleDialog
          article={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ArticleDialog({
  article,
  categories,
  onClose,
  onSaved,
}: {
  article: HelpArticle | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: article?.title ?? "",
    slug: article?.slug ?? "",
    body: article?.body ?? "",
    category: article?.category ?? "Getting started",
    status: (article?.status ?? "DRAFT") as HelpArticleStatus,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim() || !form.body.trim() || !form.category.trim()) {
      return setErr("Title, category and body are required.");
    }
    setErr("");
    setSaving(true);
    const payload: HelpArticleInput = {
      title: form.title.trim(),
      slug: form.slug.trim() || undefined,
      body: form.body,
      category: form.category.trim(),
      status: form.status,
    };
    const { error } = article
      ? await updateArticle(article.id, payload)
      : await createArticle(payload);
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{article ? "Edit article" : "New article"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="How do refunds work?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Slug (optional)</Label>
            <Input
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="auto-generated-from-title"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input
                list="help-categories"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Getting started"
              />
              <datalist id="help-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as HelpArticleStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft (hidden)</SelectItem>
                  <SelectItem value="PUBLISHED">Published (public and Assist)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Body (Markdown)</Label>
            <Textarea
              rows={14}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder={"Short answer first.\n\n## Steps\n\n1. …"}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Lead with the answer in one or two sentences. Assist quotes from published articles.
            </p>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : article ? "Save changes" : "Create article"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
