"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellRinging,
  PaperPlaneTilt,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  ArrowsClockwise,
  X,
} from "@unifesto/unicon/react";
import {
  listPushCampaigns,
  createPushBroadcast,
  sendPushCampaign,
  cancelPushCampaign,
  countPushAudience,
  sendPushTest,
  type PushCampaign,
  type PushTarget,
  type PushCampaignStatus,
  type PushBroadcastCategory,
} from "@/lib/api/push-campaigns-api";
import { getUsers } from "@/lib/api/admin-users-api";
import { getAllEventsAdmin } from "@/lib/api/admin-events-api";
import { getAllSpacesAdmin } from "@/lib/api/spaces-api";
import { audienceLine, confirmDialog } from "@/components/shared/ConfirmDialog";
import { EntitySearchSelect } from "@/components/shared/EntitySearchSelect";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
} from "@/components/ui/dialog";

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<
  PushCampaignStatus,
  { label: string; variant: "neutral" | "brand" | "success" | "warning" | "destructive" }
> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  SCHEDULED: { label: "Scheduled", variant: "warning" },
  SENDING: { label: "Sending", variant: "brand" },
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
};

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function targetLabel(c: PushCampaign): string {
  const t = c.targetSegment;
  if (!t) return "All users";
  if (t.type === "event") return `Event ${t.eventId?.slice(0, 8) ?? ""}…`;
  if (t.type === "space") return `Space ${t.spaceId?.slice(0, 8) ?? ""}…`;
  if (t.type === "users") {
    const n = t.userIds?.length ?? 0;
    return `${n} user${n === 1 ? "" : "s"}`;
  }
  if (t.type === "staff") return "Staff only";
  return "All users";
}

const CANCELLABLE: PushCampaignStatus[] = ["DRAFT", "SCHEDULED"];

type TargetType = PushTarget["type"];
type PickedUser = { id: string; name: string };
const MAX_USERS = 100;

export default function NotificationsPage() {
  const [campaigns, setCampaigns] = useState<PushCampaign[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await listPushCampaigns({ page, limit: PAGE_SIZE });
    if (error) setError(error.message);
    else if (data) {
      setCampaigns(data.items);
      setHasMore(data.items.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Delivery totals across the loaded page (the list endpoint has no aggregate).
  const totals = campaigns.reduce(
    (acc, c) => {
      acc.sent += c.sentCount;
      acc.failed += c.failedCount;
      if (c.status === "SCHEDULED") acc.scheduled += 1;
      return acc;
    },
    { sent: 0, failed: 0, scheduled: 0 }
  );

  const doSend = async (c: PushCampaign) => {
    const ok = await confirmDialog({
      title: `Send "${c.title}" now?`,
      description: <p>To {targetLabel(c).toLowerCase()}. Pushes can&apos;t be recalled once sent.</p>,
      load: () =>
        audienceLine(
          countPushAudience(c.targetSegment ?? { type: "all" }, c.category as PushBroadcastCategory)
        ),
      confirmLabel: "Send now",
    });
    if (!ok) return;
    const { error } = await sendPushCampaign(c.id);
    if (error) setError(error.message);
    else load();
  };

  const doCancel = async (id: string) => {
    const { error } = await cancelPushCampaign(id);
    if (error) setError(error.message);
    else load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Compose and monitor push broadcasts to app users"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <ArrowsClockwise className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New broadcast
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Delivered" value={totals.sent} hint="On this page" icon={CheckCircle} tone="success" loading={loading} />
        <StatCard title="Failed" value={totals.failed} hint="On this page" icon={XCircle} loading={loading} />
        <StatCard title="Scheduled" value={totals.scheduled} hint="Waiting to send" icon={Clock} tone="brand" loading={loading} />
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={BellRinging}
          title="No broadcasts yet"
          description="Compose a push broadcast to reach app users. Opt-outs are always honoured, and you can target everyone, an event's attendees, or a space's members."
          tone="positive"
          action={
            <Button onClick={() => setComposing(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New broadcast
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_BADGE[c.status].variant}>
                    {STATUS_BADGE[c.status].label}
                  </Badge>
                  <span className="font-semibold text-foreground">{c.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {c.status === "SENT" ? `Sent ${when(c.sentAt)}` : when(c.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{c.body}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{targetLabel(c)}</span>
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {c.sentCount} sent
                  </span>
                  {c.failedCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <XCircle className="h-3.5 w-3.5" />
                      {c.failedCount} failed
                    </span>
                  )}
                  {c.scheduledAt && c.status === "SCHEDULED" && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {when(c.scheduledAt)}
                    </span>
                  )}
                </div>
                {CANCELLABLE.includes(c.status) && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => doSend(c)}>
                      <PaperPlaneTilt className="mr-1.5 h-4 w-4" />
                      Send now
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => doCancel(c.id)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && (page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <ComposeDialog
        open={composing}
        onClose={() => setComposing(false)}
        onSent={() => {
          setComposing(false);
          setPage(1);
          load();
        }}
      />
    </div>
  );
}

function ComposeDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("all");
  const [targetId, setTargetId] = useState("");
  // Name of the picked event/space, for the confirm step.
  const [targetName, setTargetName] = useState("");
  const [users, setUsers] = useState<PickedUser[]>([]);
  // Names for the ids EntitySearchSelect hands back (it only returns the id).
  const seen = useRef(new Map<string, string>());
  const [pickerKey, setPickerKey] = useState(0);
  const [category, setCategory] = useState<"productUpdates" | "promotions">("productUpdates");
  const [deepLink, setDeepLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setTitle("");
    setBody("");
    setTargetType("all");
    setTargetId("");
    setTargetName("");
    setUsers([]);
    setCategory("productUpdates");
    setDeepLink("");
    setScheduledAt("");
    setError("");
  };

  const submit = async () => {
    setError("");
    if (!title.trim() || !body.trim()) {
      setError("Title and message are required.");
      return;
    }
    if (targetType === "users" && users.length === 0) {
      setError("Pick at least one user.");
      return;
    }
    if ((targetType === "event" || targetType === "space") && !targetId) {
      setError(`Pick the ${targetType} to target.`);
      return;
    }
    const target: PushTarget = {
      type: targetType,
      ...(targetType === "event" ? { eventId: targetId } : {}),
      ...(targetType === "space" ? { spaceId: targetId } : {}),
      ...(targetType === "users" ? { userIds: users.map((u) => u.id) } : {}),
    };
    const who =
      targetType === "all"
        ? "every app user"
        : targetType === "event"
          ? `attendees of ${targetName}`
          : targetType === "space"
            ? `members of ${targetName}`
            : targetType === "staff"
              ? "platform staff only"
              : users.map((u) => u.name).join(", ");
    const ok = await confirmDialog({
      title: scheduledAt ? "Schedule this push?" : "Send this push now?",
      description: (
        <>
          <p>
            &ldquo;{title.trim()}&rdquo; to {who}
            {scheduledAt ? `, on ${new Date(scheduledAt).toLocaleString("en-IN")}` : ""}, as a{" "}
            {category === "promotions" ? "promotion (opted-in only)" : "product update"}.
          </p>
          <p>Pushes can&apos;t be recalled once sent.</p>
        </>
      ),
      load: () => audienceLine(countPushAudience(target, category), scheduledAt ? "Would reach" : "Reaches"),
      confirmLabel: scheduledAt ? "Schedule" : "Send now",
      test: {
        label: "Send a test to me",
        run: async () => {
          const { data, error } = await sendPushTest({
            title: title.trim(),
            body: body.trim(),
            deepLink: deepLink.trim() || undefined,
          });
          if (error || !data) throw new Error(error?.message ?? "The test didn't send.");
          return data.sent > 0
            ? "Test sent to your devices."
            : "No device took it. Check push is on and the app is signed in on your phone.";
        },
      },
    });
    if (!ok) return;
    setSaving(true);
    const { error } = await createPushBroadcast({
      title: title.trim(),
      body: body.trim(),
      target,
      category,
      deepLink: deepLink.trim() || undefined,
      // datetime-local → ISO; empty means send immediately.
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    reset();
    onSent();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New push broadcast</DialogTitle>
          <DialogDescription>
            Sends to app users who haven&apos;t opted out. Leave the schedule empty to send now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={3} aria-label="Message" />

          <div className="flex gap-2">
            <Select
              value={targetType}
              onValueChange={(v) => {
                setTargetType(v as TargetType);
                setTargetId("");
                setTargetName("");
              }}
            >
              <SelectTrigger className="w-40" aria-label="Audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="event">Event attendees</SelectItem>
                <SelectItem value="space">Space members</SelectItem>
                <SelectItem value="users">Specific users</SelectItem>
                <SelectItem value="staff">Staff only (test run)</SelectItem>
              </SelectContent>
            </Select>
            {targetType === "event" && (
              <div className="flex-1">
                <EntitySearchSelect
                  key="event"
                  placeholder="Search events by title…"
                  onChange={(id) => {
                    setTargetId(id ?? "");
                    setTargetName(id ? (seen.current.get(id) ?? "this event") : "");
                  }}
                  search={async (q) => {
                    const { data } = await getAllEventsAdmin({ search: q, limit: 8 });
                    const found = data?.events ?? [];
                    for (const e of found) seen.current.set(e.id, e.title);
                    return found;
                  }}
                  getId={(e) => e.id}
                  getPrimary={(e) => e.title}
                  getSecondary={(e) => e.space?.name ?? e.slug}
                />
              </div>
            )}
            {targetType === "space" && (
              <div className="flex-1">
                <EntitySearchSelect
                  key="space"
                  placeholder="Search spaces by name…"
                  onChange={(id) => {
                    setTargetId(id ?? "");
                    setTargetName(id ? (seen.current.get(id) ?? "this space") : "");
                  }}
                  search={async (q) => {
                    const { data } = await getAllSpacesAdmin({ search: q, limit: 8 });
                    const found = data?.spaces ?? [];
                    for (const sp of found) seen.current.set(sp.id, sp.name);
                    return found;
                  }}
                  getId={(sp) => sp.id}
                  getPrimary={(sp) => sp.name}
                  getSecondary={(sp) => `@${sp.slug}`}
                />
              </div>
            )}
          </div>

          {targetType === "users" && (
            <div className="space-y-2">
              <EntitySearchSelect
                key={pickerKey}
                placeholder="Search by name, email, or phone…"
                onChange={(id) => {
                  if (!id || users.some((u) => u.id === id) || users.length >= MAX_USERS) return;
                  setUsers((prev) => [...prev, { id, name: seen.current.get(id) ?? "User" }]);
                  // Remount to clear the picker for the next person.
                  setPickerKey((k) => k + 1);
                }}
                search={async (q) => {
                  const { data } = await getUsers({ search: q, limit: 8 });
                  const found = data?.users ?? [];
                  for (const u of found) seen.current.set(u.id, u.fullName || u.username || "Unnamed");
                  return found;
                }}
                getId={(u) => u.id}
                getPrimary={(u) => u.fullName || u.username || "Unnamed"}
                getSecondary={(u) => u.email || u.mobileNumber || u.id}
              />
              {users.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {users.map((u) => (
                    <span key={u.id} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
                      {u.name}
                      <button
                        type="button"
                        onClick={() => setUsers((prev) => prev.filter((x) => x.id !== u.id))}
                        className="rounded-full p-0.5 hover:bg-background"
                        aria-label={`Remove ${u.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="push-category" className="mb-1 block text-xs text-muted-foreground">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as "productUpdates" | "promotions")}>
              <SelectTrigger id="push-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="productUpdates">Product update</SelectItem>
                <SelectItem value="promotions">Promotion</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {category === "productUpdates"
                ? "Reaches everyone except users who turned product updates off."
                : "Marketing — reaches only users who opted in to promotions."}
            </p>
          </div>

          <Input value={deepLink} onChange={(e) => setDeepLink(e.target.value)} placeholder="Deep link (optional, e.g. unifesto://event/slug)" aria-label="Deep link" />

          <div>
            <label htmlFor="push-schedule" className="mb-1 block text-xs text-muted-foreground">Schedule (optional)</label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} id="push-schedule" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : scheduledAt ? "Schedule" : "Send now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
