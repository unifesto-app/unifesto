"use client";

import { useCallback, useEffect, useState } from "react";
import { Article, Plus, PencilSimple, Trash, Star } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ImageUploadCard } from "@/components/shared/ImageUploadCard";
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
  createPost,
  deletePost,
  getAllPosts,
  updatePost,
  uploadBlogCover,
  type BlogInput,
  type BlogPost,
  type BlogStatus,
} from "@/lib/api/blog-api";

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<BlogPost | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getAllPosts();
    setLoading(false);
    if (err) setError(err.message);
    else {
      setError("");
      setPosts(data ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (p: BlogPost) => {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    const { error: err } = await deletePost(p.id);
    if (err) return setError(err.message);
    setPosts((ps) => ps.filter((x) => x.id !== p.id));
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog"
        subtitle="Write and publish posts for the public blog."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New post
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
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Article}
              title="No posts yet"
              description="Write your first blog post to publish it on the public blog."
              action={
                <Button onClick={() => setEditing("new")}>
                  <Plus className="h-4 w-4" /> New post
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {posts.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              {p.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.coverImageUrl}
                  alt=""
                  className="h-12 w-20 shrink-0 rounded-md border border-border object-cover"
                />
              ) : (
                <div className="grid h-12 w-20 shrink-0 place-items-center rounded-md border border-border bg-muted/30 text-muted-foreground">
                  <Article className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-foreground">
                    {p.title}
                  </p>
                  {p.featured && (
                    <Star className="h-3.5 w-3.5 text-amber-500" weight="fill" />
                  )}
                  <Badge variant={p.status === "PUBLISHED" ? "success" : "warning"}>
                    {p.status === "PUBLISHED" ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {p.category} · {p.author}
                  {p.status === "PUBLISHED" ? ` · ${fmt(p.publishedAt)}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                  <PencilSimple className="h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(p)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PostDialog
          post={editing === "new" ? null : editing}
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

function PostDialog({
  post,
  onClose,
  onSaved,
}: {
  post: BlogPost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    excerpt: post?.excerpt ?? "",
    content: post?.content ?? "",
    category: post?.category ?? "Product Updates",
    author: post?.author ?? "Unifesto Team",
    coverImageUrl: post?.coverImageUrl ?? "",
    readMinutes: post?.readMinutes?.toString() ?? "",
    featured: post?.featured ?? false,
    status: (post?.status ?? "DRAFT") as BlogStatus,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim() || !form.excerpt.trim() || !form.content.trim()) {
      return setErr("Title, excerpt and content are required.");
    }
    setErr("");
    setSaving(true);
    const payload: BlogInput = {
      title: form.title.trim(),
      slug: form.slug.trim() || undefined,
      excerpt: form.excerpt.trim(),
      content: form.content,
      category: form.category.trim(),
      author: form.author.trim(),
      coverImageUrl: form.coverImageUrl || undefined,
      readMinutes: form.readMinutes ? Number(form.readMinutes) : undefined,
      featured: form.featured,
      status: form.status,
    };
    const { error } = post
      ? await updatePost(post.id, payload)
      : await createPost(payload);
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{post ? "Edit post" : "New post"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="A great headline"
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

          <ImageUploadCard
            title="Cover image"
            description="Shown on the blog card and post header (16:9)."
            imageUrl={form.coverImageUrl || null}
            aspectClassName="aspect-[16/9]"
            cropAspect={16 / 9}
            onUpload={async (file) => {
              const { data, error } = await uploadBlogCover(file);
              return { url: data?.url ?? null, error: error?.message ?? null };
            }}
            onUploaded={(url) => set("coverImageUrl", url)}
          />

          <div className="space-y-1.5">
            <Label>Excerpt</Label>
            <Textarea
              rows={2}
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              placeholder="A one or two sentence summary."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Content (Markdown)</Label>
            <Textarea
              rows={12}
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder={"# Heading\n\nWrite your post in Markdown…"}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Product Updates"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Author</Label>
              <Input
                value={form.author}
                onChange={(e) => set("author", e.target.value)}
                placeholder="Unifesto Team"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Read time (minutes)</Label>
              <Input
                type="number"
                value={form.readMinutes}
                onChange={(e) => set("readMinutes", e.target.value)}
                placeholder="5"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as BlogStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft (hidden)</SelectItem>
                  <SelectItem value="PUBLISHED">Published (public)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => set("featured", e.target.checked)}
              className="h-4 w-4"
            />
            Feature this post (larger card at the top of the blog)
          </label>

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : post ? "Save changes" : "Create post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
