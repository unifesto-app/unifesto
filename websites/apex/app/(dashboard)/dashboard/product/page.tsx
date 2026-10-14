"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Lightning, Plus, Trash } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PM_MCP_URL,
  PM_STATUSES,
  createToken,
  getActivity,
  getBoard,
  getTokens,
  revokeToken,
  upsertTask,
  upsertTrack,
  type PmActivity,
  type PmStatus,
  type PmTask,
  type PmToken,
  type PmTrack,
} from "@/lib/api/pm-api";

const STATUS: Record<
  PmStatus,
  { label: string; variant: "brand" | "success" | "warning" | "destructive" | "neutral" | "outline" }
> = {
  NEXT: { label: "Next", variant: "brand" },
  IN_PROGRESS: { label: "In progress", variant: "warning" },
  BLOCKED: { label: "Blocked", variant: "destructive" },
  PLANNED: { label: "Planned", variant: "outline" },
  DONE: { label: "Done", variant: "success" },
  PARKED: { label: "Parked", variant: "neutral" },
  DROPPED: { label: "Dropped", variant: "neutral" },
};

const ACTIVE: PmStatus[] = ["NEXT", "IN_PROGRESS", "BLOCKED"];
type Filter = "open" | "active" | "all" | PmStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "active", label: "Now" },
  { value: "all", label: "All" },
  ...PM_STATUSES.map((s) => ({ value: s, label: STATUS[s].label })),
];

const matches = (f: Filter, s: PmStatus) =>
  f === "all" ||
  (f === "open" && !["DONE", "PARKED", "DROPPED"].includes(s)) ||
  (f === "active" && ACTIVE.includes(s)) ||
  f === s;

/** Done out of everything still in scope (parked and dropped don't count). */
const progress = (tasks: PmTask[]) => {
  const scope = tasks.filter((t) => t.status !== "PARKED" && t.status !== "DROPPED");
  const done = scope.filter((t) => t.status === "DONE").length;
  return { done, total: scope.length, pct: scope.length ? Math.round((done / scope.length) * 100) : 0 };
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground";

export default function ProductPage() {
  const [tracks, setTracks] = useState<PmTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [editing, setEditing] = useState<PmTask | "new" | null>(null);
  const [newTrack, setNewTrack] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await getBoard();
    setLoading(false);
    if (err) setError(err.message);
    else {
      setError("");
      setTracks(data ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => tracks.flatMap((t) => t.tasks), [tracks]);
  const overall = progress(all);

  const setStatus = async (task: PmTask, status: PmStatus) => {
    const { error: err } = await upsertTask({ key: task.key, status });
    if (err) return setError(err.message);
    void load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product"
        subtitle={`${overall.done} of ${overall.total} in-scope tasks done (${overall.pct}%). Claude updates this board too.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setNewTrack(true)}>
              <Plus className="h-4 w-4" /> Track
            </Button>
            <Button onClick={() => setEditing("new")} disabled={!tracks.length}>
              <Plus className="h-4 w-4" /> Task
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="claude">Connect Claude</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4 space-y-6">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : !tracks.length ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No tracks yet. Add one, or ask Claude to import docs/version-5.md (Connect Claude tab).
              </CardContent>
            </Card>
          ) : (
            tracks.map((track) => {
              const shown = track.tasks.filter((t) => matches(filter, t.status));
              if (!shown.length && filter !== "all") return null;
              const p = progress(track.tasks);
              return (
                <section key={track.key} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-semibold text-foreground">
                      {track.key} · {track.name}
                    </h2>
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${p.pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {p.done}/{p.total}
                    </span>
                  </div>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {shown.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onOpen={() => setEditing(task)}
                        onStatus={(s) => setStatus(task, s)}
                      />
                    ))}
                    {!shown.length && (
                      <p className="p-4 text-sm text-muted-foreground">No tasks.</p>
                    )}
                  </div>
                </section>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityList />
        </TabsContent>

        <TabsContent value="claude" className="mt-4">
          <ConnectClaude />
        </TabsContent>
      </Tabs>

      {editing && (
        <TaskDialog
          task={editing === "new" ? null : editing}
          tracks={tracks}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {newTrack && (
        <TrackDialog
          onClose={() => setNewTrack(false)}
          onSaved={() => {
            setNewTrack(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function TaskRow({
  task,
  onOpen,
  onStatus,
}: {
  task: PmTask;
  onOpen: () => void;
  onStatus: (s: PmStatus) => void;
}) {
  const overdue =
    task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date(new Date().toDateString());
  return (
    <div className="flex flex-wrap items-start gap-3 p-3">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-sm text-foreground">
          <span className="mr-2 font-mono text-xs text-muted-foreground">{task.key}</span>
          <span className="line-clamp-2 block">{task.title}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {task.owner && <span>{task.owner}</span>}
          {task.dueDate && (
            <span className={overdue ? "text-destructive" : undefined}>
              Due {fmtDate(task.dueDate)}
            </span>
          )}
          <span>Updated {fmtDate(task.updatedAt)}</span>
        </p>
      </button>
      <div className="flex items-center gap-2">
        <Badge variant={STATUS[task.status].variant}>{STATUS[task.status].label}</Badge>
        <select
          aria-label={`Status of ${task.key}`}
          className={selectCls}
          value={task.status}
          onChange={(e) => onStatus(e.target.value as PmStatus)}
        >
          {PM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TaskDialog({
  task,
  tracks,
  onClose,
  onSaved,
}: {
  task: PmTask | null;
  tracks: PmTrack[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    key: task?.key ?? "",
    trackKey: task?.trackKey ?? tracks[0]?.key ?? "",
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    status: task?.status ?? ("PLANNED" as PmStatus),
    owner: task?.owner ?? "",
    dueDate: task?.dueDate?.slice(0, 10) ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.key.trim() || !form.title.trim()) return setError("Key and title are required.");
    setSaving(true);
    const { error: err } = await upsertTask({
      key: form.key.trim(),
      trackKey: form.trackKey,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      status: form.status,
      owner: form.owner.trim() || null,
      dueDate: form.dueDate || null,
    });
    setSaving(false);
    if (err) setError(err.message);
    else onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? `Edit ${task.key}` : "New task"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pm-key">Key</Label>
              <Input id="pm-key" value={form.key} onChange={set("key")} disabled={!!task} placeholder="P21" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pm-track">Track</Label>
              <select id="pm-track" className={selectCls} value={form.trackKey} onChange={set("trackKey")}>
                {tracks.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key} · {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pm-title">Title</Label>
            <Textarea id="pm-title" rows={3} value={form.title} onChange={set("title")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pm-status">Status</Label>
              <select id="pm-status" className={selectCls} value={form.status} onChange={set("status")}>
                {PM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pm-owner">Owner</Label>
              <Input id="pm-owner" value={form.owner} onChange={set("owner")} placeholder="Claude" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pm-due">Due</Label>
              <Input id="pm-due" type="date" value={form.dueDate} onChange={set("dueDate")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pm-notes">Notes</Label>
            <Textarea id="pm-notes" rows={4} value={form.notes} onChange={set("notes")} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrackDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const save = async () => {
    if (!key.trim() || !name.trim()) return setError("Key and name are required.");
    const { error: err } = await upsertTrack({ key: key.trim(), name: name.trim() });
    if (err) setError(err.message);
    else onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New track</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="tr-key">Key</Label>
            <Input id="tr-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Q" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-name">Name</Label>
            <Input id="tr-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityList() {
  const [items, setItems] = useState<PmActivity[] | null>(null);
  useEffect(() => {
    void getActivity().then(({ data }) => setItems(data ?? []));
  }, []);
  if (!items) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((a) => (
        <div key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 text-sm">
          <span className="w-28 shrink-0 text-xs text-muted-foreground">
            {new Date(a.createdAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <span className="shrink-0 font-medium text-foreground">{a.actor}</span>
          <span className="min-w-0 flex-1 text-muted-foreground">{a.message}</span>
        </div>
      ))}
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">{text}</code>
      <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(text)} aria-label="Copy">
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ConnectClaude() {
  const [tokens, setTokens] = useState<PmToken[]>([]);
  const [name, setName] = useState("laptop");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await getTokens();
    setTokens(data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const { data, error: err } = await createToken(name.trim() || "laptop");
    if (err || !data) return setError(err?.message ?? "Could not create token");
    setFresh(data.token);
    void load();
  };

  const revoke = async (t: PmToken) => {
    if (!window.confirm(`Revoke "${t.name}"? Claude using it loses access at once.`)) return;
    await revokeToken(t.id);
    void load();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Give Claude Code a token and it can read this board, mark tasks done and log what it shipped.
        Every change it makes shows as &ldquo;Claude (token name)&rdquo; in Activity. Tokens act as you
        and stop working if you lose platform admin.
      </p>

      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name" className="max-w-xs" />
        <Button onClick={create}>
          <Lightning className="h-4 w-4" /> Create token
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {fresh && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Run this once on your laptop. The token is shown only now.
          </p>
          <CopyBlock
            text={`claude mcp add --scope user --transport http unifesto-pm ${PM_MCP_URL} --header "Authorization: Bearer ${fresh}"`}
          />
          <p className="text-sm text-muted-foreground">
            Then ask Claude things like &ldquo;what&rsquo;s next on the Unifesto board?&rdquo; or &ldquo;do P13 and
            mark it done&rdquo;.
          </p>
        </div>
      )}

      <div className="divide-y divide-border rounded-xl border border-border">
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-3 text-sm">
            <span className="flex-1 font-medium text-foreground">{t.name}</span>
            <span className="text-xs text-muted-foreground">
              {t.lastUsedAt ? `Used ${fmtDate(t.lastUsedAt)}` : "Never used"}
            </span>
            <Button size="sm" variant="ghost" onClick={() => revoke(t)} aria-label={`Revoke ${t.name}`}>
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {!tokens.length && <p className="p-3 text-sm text-muted-foreground">No tokens yet.</p>}
      </div>
    </div>
  );
}
