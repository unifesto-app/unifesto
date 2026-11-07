"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowsClockwise, PaperPlaneTilt, Plus, X } from "@unifesto/unicon/react";
import {
  cancelCampaign,
  countCampaignReach,
  createCampaign,
  draftCampaign,
  draftProblem,
  listCampaigns,
  sendCampaignTest,
  type Campaign,
  type CampaignAudience,
  type CampaignCategory,
  type CampaignChannel,
  type CampaignMessage,
  type CampaignStatus,
} from "@/lib/api/campaigns-api";
import { previewBody } from "@/lib/api/email-campaigns-api";
import { listWhatsappTemplates, type WhatsappTemplate } from "@/lib/api/whatsapp-api";
import { getUsers } from "@/lib/api/admin-users-api";
import { getAllEventsAdmin } from "@/lib/api/admin-events-api";
import { getAllSpacesAdmin } from "@/lib/api/spaces-api";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { EntitySearchSelect } from "@/components/shared/EntitySearchSelect";
import { FlagCard } from "@/components/shared/FlagCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 20;
const MAX_USERS = 500;

const STATUS: Record<CampaignStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "text-muted-foreground" },
  SCHEDULED: { label: "Scheduled", tone: "text-warning" },
  SENDING: { label: "Sending", tone: "text-foreground" },
  SENT: { label: "Sent", tone: "text-success" },
  FAILED: { label: "Failed", tone: "text-destructive" },
  CANCELLED: { label: "Cancelled", tone: "text-muted-foreground" },
  HELD: { label: "Held for review", tone: "text-warning" },
};

const AUDIENCE_LABEL: Record<CampaignAudience["type"], string> = {
  all: "Everyone",
  space: "Space members",
  event: "Event attendees",
  waitlist: "Event waitlist",
  organisers: "Organisers",
  staff: "Staff only (test run)",
  users: "Specific people",
};

const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  push: "Push",
  inapp: "In-app",
  email: "Email",
  whatsapp: "WhatsApp",
};

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function titleOf(c: Campaign): string {
  return c.content.push?.title ?? c.content.email?.subject ?? c.content.whatsapp?.templateName ?? "Campaign";
}

/** "120 sent · 40 opened · 2 failed" from one channel's delivery rows. */
function deliveryLine(s: Record<string, number> | undefined, opened?: string): string | null {
  if (!s) return null;
  const sent = (s.SENT ?? 0) + (s.DELIVERED ?? 0) + (s.OPENED ?? 0);
  const skipped = (s.SKIPPED ?? 0) + (s.SUPPRESSED ?? 0);
  return [
    `${sent} sent`,
    opened && s.OPENED ? `${s.OPENED} ${opened}` : null,
    s.FAILED ? `${s.FAILED} failed` : null,
    skipped ? `${skipped} skipped` : null,
    s.QUEUED ? `${s.QUEUED} in flight` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await listCampaigns({ page, limit: PAGE_SIZE });
    if (error) setError(error.message);
    else if (data) {
      setCampaigns(data.campaigns);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const doCancel = async (id: string) => {
    const { error } = await cancelCampaign(id);
    if (error) setError(error.message);
    else load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Campaigns"
        subtitle="One message to push, in-app, email and WhatsApp"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <ArrowsClockwise className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New campaign
            </Button>
          </div>
        }
      />

      <FlagCard field="commsPaused" title="Pause sending" risky>
        Stops campaigns, push and email campaigns, WhatsApp blasts and organiser announcements from starting.
        Email and WhatsApp sends already going stop at their next batch and carry on from there when you turn
        this off. Scheduled ones wait. Sign-in codes, receipts, tickets and reminders still go.
      </FlagCard>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={PaperPlaneTilt}
          title="No campaigns yet"
          description="Write one message and send it as a push, an in-app notice, an email and a WhatsApp template at once. Each channel keeps its own opt-outs."
          tone="positive"
          action={
            <Button onClick={() => setComposing(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New campaign
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} c={c} onCancel={() => doCancel(c.id)} />
          ))}
        </div>
      )}

      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
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

function CampaignCard({ c, onCancel }: { c: Campaign; onCancel: () => void }) {
  const lines: Array<[string, string | null]> = [
    ["Push", deliveryLine(c.counts.push)],
    ["In-app", c.counts.inapp !== undefined ? `${c.counts.inapp} delivered` : null],
    ["Email", deliveryLine(c.counts.email, "opened")],
    ["WhatsApp", deliveryLine(c.counts.whatsapp, "read")],
  ];
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
          <span className="font-semibold text-foreground">{titleOf(c)}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {c.status === "SCHEDULED" ? `For ${when(c.scheduledAt)}` : when(c.sentAt ?? c.createdAt)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {AUDIENCE_LABEL[c.audience.type]}
          {c.recipientCount ? ` · ${c.recipientCount} people` : ""} ·{" "}
          {c.channels.map((ch) => CHANNEL_LABEL[ch]).join(", ")}
          {c.category === "promotions" ? " · promotion" : ""}
        </p>
        {lines.some(([, l]) => l) && (
          <dl className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
            {lines.map(([name, line]) =>
              line ? (
                <div key={name} className="contents">
                  <dt className="text-muted-foreground">{name}</dt>
                  <dd className="text-foreground">{line}</dd>
                </div>
              ) : null
            )}
          </dl>
        )}
        {c.error && <p className="whitespace-pre-line text-xs text-destructive">{c.error}</p>}
        {(c.status === "DRAFT" || c.status === "SCHEDULED") && (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

type DeliverAs = "push" | "inapp" | "off";
type Picked = { id: string; name: string };

function ComposeDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const [deliverAs, setDeliverAs] = useState<DeliverAs>("push");
  const [useEmail, setUseEmail] = useState(false);
  const [useWhatsapp, setUseWhatsapp] = useState(false);

  const [audienceType, setAudienceType] = useState<CampaignAudience["type"]>("all");
  const [target, setTarget] = useState<Picked | null>(null);
  const [users, setUsers] = useState<Picked[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const seen = useRef(new Map<string, string>());
  const [category, setCategory] = useState<CampaignCategory>("productUpdates");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [emailPreview, setEmailPreview] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsappTemplate[] | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [params, setParams] = useState<string[]>([]);

  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Write with AI: the line it drafted from (kept as the campaign's brief) and what it said.
  const [line, setLine] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState<string[]>([]);

  const template = templates?.find((t) => t.name === templateName);

  useEffect(() => {
    if (!useWhatsapp || templates) return;
    listWhatsappTemplates().then(({ data, error }) => {
      if (error) setError(`WhatsApp templates didn't load: ${error.message}`);
      setTemplates((data ?? []).filter((t) => t.status === "APPROVED" && !t.needsMediaHeader));
    });
  }, [useWhatsapp, templates]);

  const channels: CampaignChannel[] = [
    ...(deliverAs !== "off" ? [deliverAs] : []),
    ...(useEmail ? (["email"] as const) : []),
    ...(useWhatsapp ? (["whatsapp"] as const) : []),
  ];

  const reset = () => {
    setDeliverAs("push");
    setUseEmail(false);
    setUseWhatsapp(false);
    setAudienceType("all");
    setTarget(null);
    setUsers([]);
    setCategory("productUpdates");
    setTitle("");
    setBody("");
    setDeepLink("");
    setSubject("");
    setHtml("");
    setEmailPreview(null);
    setTemplateName("");
    setParams([]);
    setScheduledAt("");
    setError("");
    setLine("");
    setAiNote([]);
  };

  /** Fill the chosen channels from the line. Nothing is sent: the admin reads and edits first. */
  const writeWithAi = async () => {
    setDrafting(true);
    setError("");
    setAiNote([]);
    const wantsWhatsapp = useWhatsapp && !!template;
    const { data, error } = await draftCampaign({
      line: line.trim(),
      channels: [...channels.filter((c) => c !== "whatsapp"), ...(wantsWhatsapp ? (["whatsapp"] as const) : [])],
      ...((audienceType === "event" || audienceType === "waitlist") && target ? { eventId: target.id } : {}),
      ...(wantsWhatsapp ? { whatsapp: { bodyText: template.bodyText ?? "", paramCount: template.bodyParamCount } } : {}),
    });
    setDrafting(false);
    if (error || !data) return setError(error?.message ?? "The draft didn't come through. Try again.");
    if (!data.ok) return setError(draftProblem(data));
    const { push, email, whatsappParams } = data.draft;
    if (push) {
      setTitle(push.title);
      setBody(push.body);
    }
    if (email) {
      setSubject(email.subject);
      setHtml(email.html);
      setEmailPreview(null);
    }
    if (whatsappParams) setParams(whatsappParams);
    setAiNote([
      "Drafted by AI from your line. Read every word before you send.",
      ...(data.dropped ?? []).map((d) => `Left out ${d}`),
    ]);
  };

  const message = (): CampaignMessage => ({
    channels,
    category,
    ...(deliverAs !== "off" ? { push: { title: title.trim(), body: body.trim(), deepLink: deepLink.trim() || undefined } } : {}),
    ...(useEmail ? { email: { subject: subject.trim(), html } } : {}),
    ...(useWhatsapp && template
      ? { whatsapp: { templateName: template.name, languageCode: template.language, bodyParams: params } }
      : {}),
  });

  const audience = (): CampaignAudience => ({
    type: audienceType,
    ...(audienceType === "space" && target ? { spaceId: target.id } : {}),
    ...((audienceType === "event" || audienceType === "waitlist") && target ? { eventId: target.id } : {}),
    ...(audienceType === "users" ? { userIds: users.map((u) => u.id) } : {}),
  });

  /** What's missing, or null when it can go. */
  const problem = (): string | null => {
    if (channels.length === 0) return "Pick at least one channel.";
    if (deliverAs !== "off" && (!title.trim() || !body.trim())) return "The push needs a title and a message.";
    if (useEmail && (!subject.trim() || !html.trim())) return "The email needs a subject and a body.";
    if (useWhatsapp && !template) return "Pick an approved WhatsApp template.";
    if (useWhatsapp && template && params.slice(0, template.bodyParamCount).some((p) => !p.trim()))
      return "Fill every WhatsApp variable.";
    if (["space", "event", "waitlist"].includes(audienceType) && !target)
      return `Pick the ${audienceType === "space" ? "space" : "event"}.`;
    if (audienceType === "users" && users.length === 0) return "Pick at least one person.";
    return null;
  };

  const submit = async () => {
    const why = problem();
    setError(why ?? "");
    if (why) return;
    const msg = message();
    const who = audienceType === "users" ? users.map((u) => u.name).join(", ") : `${AUDIENCE_LABEL[audienceType]}${target ? `: ${target.name}` : ""}`;
    const ok = await confirmDialog({
      title: scheduledAt ? "Schedule this campaign?" : "Send this campaign now?",
      description: (
        <>
          <p>
            To {who}
            {scheduledAt ? `, on ${new Date(scheduledAt).toLocaleString("en-IN")}` : ""}, as{" "}
            {category === "promotions" ? "a promotion (opted-in only)" : "a product update"}.
          </p>
          <p>Nothing can be recalled once it goes.</p>
        </>
      ),
      load: async (): Promise<ReactNode> => {
        const { data, error } = await countCampaignReach({ audience: audience(), channels, category, whatsapp: msg.whatsapp });
        if (error || !data) throw new Error(error?.message ?? "Couldn't count the audience.");
        if (data.audience === 0) throw new Error("Nobody is in this audience.");
        return (
          <ul className="space-y-0.5 text-sm">
            <li>{data.audience} people in the audience</li>
            {channels.map((ch) => (
              <li key={ch}>
                {CHANNEL_LABEL[ch]}: {data[ch] ?? 0} {scheduledAt ? "would get it now" : "get it"}
              </li>
            ))}
          </ul>
        );
      },
      confirmLabel: scheduledAt ? "Schedule" : "Send now",
      test: {
        label: "Send a test to me",
        run: async () => {
          const { data, error } = await sendCampaignTest(msg);
          if (error || !data) throw new Error(error?.message ?? "The test didn't send.");
          const sent = data.sent.map((ch) => CHANNEL_LABEL[ch]).join(", ");
          return [sent && `Sent to you: ${sent}.`, ...data.errors].filter(Boolean).join(" ");
        },
      },
    });
    if (!ok) return;
    setSaving(true);
    const { data, error } = await createCampaign({
      ...msg,
      audience: audience(),
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      brief: aiNote.length ? line.trim() : undefined,
    });
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "It didn't send.");
      return;
    }
    if (data.status === "FAILED") {
      setError(data.error ?? "No channel could send it.");
      return;
    }
    reset();
    onSent();
  };

  const showEmailPreview = async () => {
    const { data, error } = await previewBody(html);
    if (error || !data) setError(error?.message ?? "The preview didn't load.");
    else setEmailPreview(data.html);
  };

  const picker = (kind: "event" | "space") => (
    <EntitySearchSelect
      key={`${kind}-${audienceType}`}
      placeholder={kind === "event" ? "Search events by title…" : "Search spaces by name…"}
      onChange={(id) => setTarget(id ? { id, name: seen.current.get(id) ?? `this ${kind}` } : null)}
      search={async (q) => {
        if (kind === "event") {
          const { data } = await getAllEventsAdmin({ search: q, limit: 8 });
          const found = (data?.events ?? []).map((e) => ({ id: e.id, primary: e.title, secondary: e.space?.name ?? e.slug }));
          for (const f of found) seen.current.set(f.id, f.primary);
          return found;
        }
        const { data } = await getAllSpacesAdmin({ search: q, limit: 8 });
        const found = (data?.spaces ?? []).map((s) => ({ id: s.id, primary: s.name, secondary: `@${s.slug}` }));
        for (const f of found) seen.current.set(f.id, f.primary);
        return found;
      }}
      getId={(f) => f.id}
      getPrimary={(f) => f.primary}
      getSecondary={(f) => f.secondary}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            One audience, the channels you pick. Each channel keeps its own opt-outs and the daily cap.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Channels</h3>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">App</span>
                <Select value={deliverAs} onValueChange={(v) => setDeliverAs(v as DeliverAs)}>
                  <SelectTrigger className="w-44" aria-label="Deliver in the app as">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="push">Push and in-app</SelectItem>
                    <SelectItem value="inapp">In-app only</SelectItem>
                    <SelectItem value="off">Not in the app</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={useEmail} onChange={(e) => setUseEmail(e.target.checked)} className="h-4 w-4 rounded border-input" />
                Email
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={useWhatsapp} onChange={(e) => setUseWhatsapp(e.target.checked)} className="h-4 w-4 rounded border-input" />
                WhatsApp
              </label>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Audience</h3>
            <div className="flex flex-wrap gap-2">
              <Select
                value={audienceType}
                onValueChange={(v) => {
                  setAudienceType(v as CampaignAudience["type"]);
                  setTarget(null);
                }}
              >
                <SelectTrigger className="w-48" aria-label="Audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={(v) => setCategory(v as CampaignCategory)}>
                <SelectTrigger className="w-44" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="productUpdates">Product update</SelectItem>
                  <SelectItem value="promotions">Promotion</SelectItem>
                </SelectContent>
              </Select>
              <div className="min-w-56 flex-1">
                {audienceType === "space" && picker("space")}
                {(audienceType === "event" || audienceType === "waitlist") && picker("event")}
              </div>
            </div>
            {audienceType === "users" && (
              <div className="space-y-2">
                <EntitySearchSelect
                  key={pickerKey}
                  placeholder="Search by name, email, or phone…"
                  onChange={(id) => {
                    if (!id || users.some((u) => u.id === id) || users.length >= MAX_USERS) return;
                    setUsers((prev) => [...prev, { id, name: seen.current.get(id) ?? "User" }]);
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
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {users.map((u) => (
                      <span key={u.id} className="flex items-center gap-1">
                        {u.name}
                        <button
                          type="button"
                          onClick={() => setUsers((prev) => prev.filter((x) => x.id !== u.id))}
                          className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
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
            <p className="text-xs text-muted-foreground">
              {category === "productUpdates"
                ? "Push and in-app reach everyone who hasn't switched product updates off. Platform email only goes to people who opted in to promotions."
                : "Only people who opted in to promotions get it, on every channel."}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Write with AI</h3>
            <div className="flex gap-2">
              <Input
                value={line}
                onChange={(e) => setLine(e.target.value)}
                placeholder="One line, e.g. Orbit Summit registrations close this Sunday"
                aria-label="What to tell people"
                maxLength={500}
              />
              <Button
                type="button"
                variant="outline"
                onClick={writeWithAi}
                disabled={drafting || line.trim().length < 3 || channels.length === 0}
              >
                {drafting ? "Drafting…" : "Draft it"}
              </Button>
            </div>
            {aiNote.length > 0 ? (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {aiNote.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pick the channels first. It fills each one from your line and the event, and adds no dates, prices or links you didn&apos;t
                give. You still read and send it.
              </p>
            )}
          </section>

          {deliverAs !== "off" && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{deliverAs === "push" ? "Push and in-app" : "In-app"}</h3>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Push title" maxLength={255} />
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={3} aria-label="Push message" maxLength={2000} />
              <Input value={deepLink} onChange={(e) => setDeepLink(e.target.value)} placeholder="Opens (optional, e.g. unifesto://event/slug)" aria-label="Deep link" />
              {(title.trim() || body.trim()) && (
                <div className="rounded-xl bg-muted px-4 py-3 text-sm" aria-label="Push preview">
                  <p className="font-semibold">{title.trim() || "Title"}</p>
                  <p className="line-clamp-3 text-muted-foreground">{body.trim() || "Message"}</p>
                </div>
              )}
            </section>
          )}

          {useEmail && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Email</h3>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Email subject" maxLength={255} />
              <Textarea
                value={html}
                onChange={(e) => {
                  setHtml(e.target.value);
                  setEmailPreview(null);
                }}
                placeholder="Body (HTML). {{firstName}} becomes each person's first name."
                rows={6}
                aria-label="Email body"
                className="font-mono text-xs"
              />
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={showEmailPreview} disabled={!html.trim()}>
                  Preview
                </Button>
                {emailPreview && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEmailPreview(null)}>
                    Hide preview
                  </Button>
                )}
              </div>
              {emailPreview && (
                <iframe title="Email preview" srcDoc={emailPreview} sandbox="" className="h-80 w-full rounded-xl border bg-white" />
              )}
            </section>
          )}

          {useWhatsapp && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">WhatsApp</h3>
              <Select
                value={templateName}
                onValueChange={(v) => {
                  setTemplateName(v);
                  const t = templates?.find((x) => x.name === v);
                  setParams(Array.from({ length: t?.bodyParamCount ?? 0 }, () => ""));
                }}
              >
                <SelectTrigger aria-label="WhatsApp template">
                  <SelectValue placeholder={templates ? "Pick an approved template" : "Loading templates…"} />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={`${t.name}-${t.language}`} value={t.name}>
                      {t.name} · {t.category.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {params.map((p, i) => (
                <Input
                  key={i}
                  value={p}
                  onChange={(e) => setParams((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i === 0 ? "e.g. {name}" : "Value"}
                  aria-label={`WhatsApp variable ${i + 1}`}
                />
              ))}
              {template?.bodyText && (
                <p className="whitespace-pre-line rounded-xl bg-muted px-4 py-3 text-sm" aria-label="WhatsApp preview">
                  {template.bodyText.replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1]?.trim() || m)}
                </p>
              )}
              {template && (
                <p className="text-xs text-muted-foreground">
                  Meta bills every {template.category.toLowerCase()} message. A marketing template only goes to people who opted in to
                  promotions.
                </p>
              )}
            </section>
          )}

          <section className="space-y-1">
            <label htmlFor="campaign-schedule" className="text-sm font-medium">
              Schedule (optional)
            </label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} id="campaign-schedule" />
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Sending…" : scheduledAt ? "Schedule" : "Send now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
