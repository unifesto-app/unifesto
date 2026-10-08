"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Tag,
  Plus,
  PencilSimple,
  Trash,
  ArrowUp,
  ArrowDown,
  X,
} from "@unifesto/unicon/react";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryBanner,
  type Category,
} from "@/lib/api/categories-api";
import { ImageUploadCard } from "@/components/shared/ImageUploadCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FormState {
  name: string;
  description: string;
  bannerUrl: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  bannerUrl: "",
};

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editor panel: null = closed, "new" = create, otherwise the category id.
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Ids currently mid-mutation (reorder / delete) — disables their controls.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getCategories();
    if (error) setError(error.message);
    else if (data)
      setCategories([...data].sort((a, b) => a.order - b.order));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setEditing("new");
  }

  function openEdit(cat: Category) {
    setForm({
      name: cat.name,
      description: cat.description ?? "",
      bannerUrl: cat.bannerUrl ?? "",
    });
    setFormError("");
    setEditing(cat.id);
  }

  function closeEditor() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    setSaving(true);
    setFormError("");

    const payload = {
      name,
      description: form.description.trim() || undefined,
      bannerUrl: form.bannerUrl.trim() || undefined,
    };

    const { error } =
      editing === "new"
        ? await createCategory(payload)
        : await updateCategory(editing as string, payload);

    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    closeEditor();
    void load();
  }

  async function handleDelete(cat: Category) {
    if (
      !window.confirm(
        `Deactivate “${cat.name}”? It will be hidden from event creation.`
      )
    )
      return;
    setBusyIds((s) => new Set(s).add(cat.id));
    const { error } = await deleteCategory(cat.id);
    setBusyIds((s) => {
      const next = new Set(s);
      next.delete(cat.id);
      return next;
    });
    if (error) {
      setError(error.message);
      return;
    }
    void load();
  }

  // Swap `order` values with the adjacent row, then persist both.
  async function handleReorder(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const a = categories[index];
    const b = categories[target];

    setBusyIds((s) => new Set(s).add(a.id).add(b.id));

    // Optimistic reorder for a snappy list.
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);

    const [r1, r2] = await Promise.all([
      updateCategory(a.id, { order: b.order }),
      updateCategory(b.id, { order: a.order }),
    ]);

    setBusyIds((s) => {
      const clone = new Set(s);
      clone.delete(a.id);
      clone.delete(b.id);
      return clone;
    });

    if (r1.error || r2.error) {
      setError(r1.error?.message || r2.error?.message || "Failed to reorder.");
      void load();
      return;
    }
    void load();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Categories
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading categories…"
              : `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
          </p>
        </div>
        <Button onClick={openCreate} disabled={editing === "new"}>
          <Plus className="mr-1.5 h-4 w-4" />
          New category
        </Button>
      </header>

      {error && (
        <Card className="border-destructive/30 bg-destructive-soft">
          <CardContent className="py-4">
            <p className="text-sm text-[hsl(358_65%_44%)]">{error}</p>
          </CardContent>
        </Card>
      )}

      {editing !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-0">
            <CardTitle className="text-base">
              {editing === "new" ? "New category" : "Edit category"}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={closeEditor}
              aria-label="Close editor"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Workshops"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Input
                id="cat-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Short description (optional)"
              />
            </div>

            <ImageUploadCard
              title="Banner image"
              description="Shown on the category. Recommended 4:3."
              imageUrl={form.bannerUrl || null}
              aspectClassName="aspect-[4/3]"
              cropAspect={4 / 3}
              emptyLabel="Upload a 4:3 banner"
              containerClassName="max-w-xs"
              onUpload={async (file) => {
                const { data, error } = await uploadCategoryBanner(file);
                return { url: data?.url ?? null, error: error?.message ?? null };
              }}
              onUploaded={(url) => setForm((f) => ({ ...f, bannerUrl: url }))}
            />

            {formError && (
              <p className="text-sm text-[hsl(358_65%_44%)]">{formError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeEditor} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing === "new" ? "Create" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">All categories</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <ListSkeleton />
          ) : categories.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Order</th>
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 font-medium">Slug</th>
                    <th className="pb-2 pr-4 font-medium">Events</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => {
                    const busy = busyIds.has(cat.id);
                    return (
                      <tr
                        key={cat.id}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={busy || i === 0}
                              onClick={() => handleReorder(i, -1)}
                              aria-label="Move up"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={busy || i === categories.length - 1}
                              onClick={() => handleReorder(i, 1)}
                              aria-label="Move down"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
                              {cat.bannerUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={cat.bannerUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Tag className="h-4 w-4 text-muted-foreground" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {cat.name}
                              </p>
                              {cat.description && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {cat.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {cat.slug}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="neutral">
                            {cat.event_count.toLocaleString("en-IN")}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={busy}
                              onClick={() => openEdit(cat)}
                              aria-label={`Edit ${cat.name}`}
                            >
                              <PencilSimple className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-[hsl(358_65%_44%)] hover:text-[hsl(358_65%_44%)]"
                              disabled={busy}
                              onClick={() => handleDelete(cat)}
                              aria-label={`Deactivate ${cat.name}`}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-secondary">
        <Tag className="h-6 w-6 text-secondary-foreground" />
      </span>
      <div>
        <p className="font-medium text-foreground">No categories yet</p>
        <p className="text-sm text-muted-foreground">
          Create your first category to organise events.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="mr-1.5 h-4 w-4" />
        New category
      </Button>
    </div>
  );
}
