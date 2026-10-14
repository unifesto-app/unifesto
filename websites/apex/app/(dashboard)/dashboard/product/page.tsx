"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Lightning, MagnifyingGlass, Plus, Trash } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils/cn";
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

/** Column metadata. `dot` is the only colour on a card; state, never decoration. */
const STATUS: Record<PmStatus, { label: string; dot: string }> = {
  PLANNED: { label: "Planned", dot: "bg-muted-foreground" },
  NEXT: { label: "Next", dot: "bg-primary" },
  IN_PROGRESS: { label: "In progress", dot: "bg-warning" },
  BLOCKED: { label: "Blocked", dot: "bg-destructive" },
  IN_REVIEW: { label: "In review", dot: "bg-success/50" },
  DONE: { label: "Done", dot: "bg-success" },
  PARKED: { label: "Parked", dot: "bg-border-strong" },
  DROPPED: { label: "Dropped", dot: "bg-border-strong" },
};

/** Left-to-right flow of work. Parked / dropped only show when asked for. */
const FLOW: PmStatus[] = ["PLANNED", "NEXT", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE"];
const SHELVED: PmStatus[] = ["PARKED", "DROPPED"];

/** Done out of everything still in scope (parked and dropped don't count). */
const progress = (tasks: PmTask[]) => {
  const scope = tasks.filter((t) => !SHELVED.includes(t.status));
  const done = scope.filter((t) => t.status === "DONE").length;
  return { done, total: scope.length, pct: scope.length ? Math.round((done / scope.length) * 100) : 0 };
};

/**
 * Order inside a column. Done reads newest-first (what just shipped); every
 * other column puts dated work first, soonest due on top, then the plan order.
 */
const cardOrder = (status: PmStatus) => (a: PmTask, b: PmTask) => {
  if (status === "DONE") return b.updatedAt.localeCompare(a.updatedAt);
  if (a.dueDate !== b.dueDate) return !a.dueDate ? 1 : !b.dueDate ? -1 : a.dueDate.localeCompare(b.dueDate);
  return a.trackKey.localeCompare(b.trackKey) || a.sortOrder - b.sortOrder || a.key.localeCompare(b.key, undefined, { numeric: true });
};

/** Next free key in a track: "P" with P1..P20 taken → "P21". */
const nextKey = (track: PmTrack | undefined) => {
  if (!track) return "";
  const nums = track.tasks
    .map((t) => t.key.match(new RegExp(`^${track.key}(\\d+)$`))?.[1])
    .filter(Boolean)
    .map(Number);
  return `${track.key}${nums.length ? Math.max(...nums) + 1 : 1}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const isOverdue = (t: PmTask) =>
  !!t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date(new Date().toDateString());

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground";

type Editing = { task: PmTask } | { status: PmStatus } | null;

export default function ProductPage() {
  const [tracks, setTracks] = useState<PmTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trackFilter, setTrackFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showShelved, setShowShelved] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
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
  const trackName = useMemo(() => new Map(tracks.map((t) => [t.key, t.name])), [tracks]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (t) =>
        (!trackFilter || t.trackKey === trackFilter) &&
        (!q || `${t.key} ${t.title} ${t.owner ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(q))
    );
  }, [all, trackFilter, query]);

  /** Optimistic: the card lands at once; a failed save reloads the truth. */
  const move = async (key: string, status: PmStatus) => {
    const task = all.find((t) => t.key === key);
    if (!task || task.status === status) return;
    setTracks((ts) =>
      ts.map((tr) => ({
        ...tr,
        tasks: tr.tasks.map((t) =>
          t.key === key ? { ...t, status, updatedAt: new Date().toISOString() } : t
        ),
      }))
    );
    const { error: err } = await upsertTask({ key, status });
    if (err) {
      setError(`Couldn't move ${key}: ${err.message}`);
      void load();
    }
  };

  const columns = showShelved ? [...FLOW, ...SHELVED] : FLOW;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Product"
        title="Board"
        subtitle={`${overall.done} of ${overall.total} in-scope tasks done (${overall.pct}%). Claude moves cards here too.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setNewTrack(true)}>
              <Plus className="h-4 w-4" /> Track
            </Button>
            <Button onClick={() => setEditing({ status: "PLANNED" })} disabled={!tracks.length}>
              <Plus className="h-4 w-4" /> Task
            </Button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="claude">Connect Claude</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4 space-y-4">
          {/* Tracks double as the filter: each chip carries its own progress. */}
          {tracks.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <TrackChip
                label="All tracks"
                p={overall}
                active={!trackFilter}
                onClick={() => setTrackFilter(null)}
              />
              {tracks.map((t) => (
                <TrackChip
                  key={t.key}
                  label={`${t.key} · ${t.name}`}
                  p={progress(t.tasks)}
                  active={trackFilter === t.key}
                  onClick={() => setTrackFilter(trackFilter === t.key ? null : t.key)}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by key, title, owner…"
                className="pl-9"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showShelved}
                onChange={(e) => setShowShelved(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Show parked &amp; dropped
            </label>
          </div>

          {loading ? (
            <div className="flex gap-4 overflow-hidden">
              {FLOW.map((s) => (
                <Skeleton key={s} className="h-96 w-72 shrink-0 rounded-xl" />
              ))}
            </div>
          ) : !tracks.length ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No tracks yet. Add one, or ask Claude to import docs/version-5.md (Connect Claude tab).
              </CardContent>
            </Card>
          ) : (
            <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0">
              {columns.map((status) => (
                <Column
                  key={status}
                  status={status}
                  tasks={visible.filter((t) => t.status === status).sort(cardOrder(status))}
                  trackName={trackName}
                  onDrop={(key) => void move(key, status)}
                  onOpen={(task) => setEditing({ task })}
                  onAdd={() => setEditing({ status })}
                />
              ))}
            </div>
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
          task={"task" in editing ? editing.task : null}
          defaultStatus={"status" in editing ? editing.status : undefined}
          defaultTrack={trackFilter ?? undefined}
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

function TrackChip({
  label,
  p,
  active,
  onClick,
}: {
  label: string;
  p: { done: number; total: number; pct: number };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 flex-col gap-1.5 rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-border-strong bg-primary-soft text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground"
      )}
    >
      <span className="flex items-baseline gap-2 whitespace-nowrap text-xs font-medium">
        {label}
        <span className="font-mono text-[10px] text-muted-foreground">
          {p.done}/{p.total}
        </span>
      </span>
      <span className="h-1 w-full min-w-24 overflow-hidden rounded-full bg-muted">
        <span className="block h-full bg-success" style={{ width: `${p.pct}%` }} />
      </span>
    </button>
  );
}

function Column({
  status,
  tasks,
  trackName,
  onDrop,
  onOpen,
  onAdd,
}: {
  status: PmStatus;
  tasks: PmTask[];
  trackName: Map<string, string>;
  onDrop: (key: string) => void;
  onOpen: (task: PmTask) => void;
  onAdd: () => void;
}) {
  const [over, setOver] = useState(false);
  const meta = STATUS[status];
  return (
    <section
      aria-label={`${meta.label}, ${tasks.length} tasks`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const key = e.dataTransfer.getData("text/plain");
        if (key) onDrop(key);
      }}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col rounded-xl border bg-card/60 transition-colors xl:w-auto xl:min-w-52 xl:flex-1",
        over ? "border-border-strong bg-muted" : "border-border"
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden />
        <h2 className="text-sm font-medium text-foreground">{meta.label}</h2>
        <span className="font-mono text-xs text-muted-foreground">{tasks.length}</span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add task to ${meta.label}`}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>
      <div className="flex max-h-[calc(100vh-20rem)] min-h-32 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} trackName={trackName.get(t.trackKey)} onOpen={() => onOpen(t)} />
        ))}
        {!tasks.length && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Drop a card here
          </p>
        )}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  trackName,
  onOpen,
}: {
  task: PmTask;
  trackName?: string;
  onOpen: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const overdue = isOverdue(task);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.key);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={onOpen}
      className={cn(
        "group w-full cursor-grab rounded-lg border border-border bg-background p-3 text-left transition-[border-color,opacity,transform] duration-150 hover:border-border-strong active:cursor-grabbing",
        dragging && "opacity-40"
      )}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono text-foreground">{task.key}</span>
        {trackName && <span className="truncate">{trackName}</span>}
      </div>
      <p className="mt-1.5 line-clamp-3 text-sm leading-snug text-foreground">{task.title}</p>
      {(task.owner || task.dueDate) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {task.owner && <span>{task.owner}</span>}
          {task.dueDate && (
            <span className={overdue ? "font-medium text-destructive" : undefined}>
              {overdue ? "Overdue · " : "Due "}
              {fmtDate(task.dueDate)}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function TaskDialog({
  task,
  defaultStatus = "PLANNED",
  defaultTrack,
  tracks,
  onClose,
  onSaved,
}: {
  task: PmTask | null;
  defaultStatus?: PmStatus;
  defaultTrack?: string;
  tracks: PmTrack[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialTrack = task?.trackKey ?? defaultTrack ?? tracks[0]?.key ?? "";
  const [form, setForm] = useState({
    key: task?.key ?? nextKey(tracks.find((t) => t.key === initialTrack)),
    trackKey: initialTrack,
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    status: task?.status ?? defaultStatus,
    owner: task?.owner ?? "",
    dueDate: task?.dueDate?.slice(0, 10) ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  // A new task's key follows its track until the user types their own.
  const setTrack = (e: { target: { value: string } }) =>
    setForm((f) => ({
      ...f,
      trackKey: e.target.value,
      key:
        task || f.key !== nextKey(tracks.find((t) => t.key === f.trackKey))
          ? f.key
          : nextKey(tracks.find((t) => t.key === e.target.value)),
    }));

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
              <select id="pm-track" className={selectCls} value={form.trackKey} onChange={setTrack}>
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
