"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  PaperPlaneTilt,
  Eye,
  ArrowLeft,
  Users,
  CalendarBlank,
  Clock,
  BellRinging,
  EnvelopeSimple,
  Sparkle,
} from "@unifesto/unicon/react";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import {
  countCampaignReach,
  createCampaign,
  draftCampaign,
  draftProblem,
  sendCampaignTest,
  type CampaignAudience,
  type CampaignChannel,
  type CampaignMessage,
} from "@/console/lib/api/campaigns-api";
import { previewBody } from "@/console/lib/api/email-campaigns-api";
import { listTemplates, type EmailTemplate } from "@/console/lib/api/email-templates-api";
import { getSpaceEvents, type Event } from "@/console/lib/api/events-api";
import { getSpaceMembers, type SpaceMember } from "@/console/lib/api/spaces-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { EmailBodyEditor } from "@/console/components/shared/EmailBodyEditor";
import { confirmDialog } from "@/console/components/shared/ConfirmDialog";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Textarea } from "@/console/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

type Target = CampaignAudience["type"];
type InApp = "push" | "inapp" | "off";

const TARGETS: { value: Target; label: string; needs?: "event" | "member" }[] = [
  { value: "space", label: "All space members" },
  { value: "event", label: "Attendees of an event", needs: "event" },
  { value: "not_checked_in", label: "Attendees not checked in yet", needs: "event" },
  { value: "waitlist", label: "Waitlist of an event", needs: "event" },
  { value: "users", label: "A single member", needs: "member" },
];

/** "2 h before the start", "30 min after the start". */
function relative(min: number): string {
  if (min === 0) return "at the start";
  const abs = Math.abs(min);
  const amount = abs < 60 ? `${abs} min` : `${Number((abs / 60).toFixed(1))} h`;
  return `${amount} ${min < 0 ? "before" : "after"} the start`;
}

const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  push: "Push and in-app",
  inapp: "In-app",
  email: "Email",
};

export default function SpaceComposeCampaignPage() {
  const spaceId = useSpaceId();
  const router = useRouter();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<SpaceMember[]>([]);

  const [inApp, setInApp] = useState<InApp>("push");
  const [useEmail, setUseEmail] = useState(true);

  const [target, setTarget] = useState<Target>("space");
  const [targetId, setTargetId] = useState("");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [timing, setTiming] = useState<"now" | "at" | "event">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [offsetHours, setOffsetHours] = useState("2");
  const [offsetDir, setOffsetDir] = useState<"before" | "after">("before");

  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Write with AI: the line it drafted from (kept as the campaign's brief) and what it said.
  const [line, setLine] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState<string[]>([]);

  const targetDef = TARGETS.find((t) => t.value === target)!;
  const channels: CampaignChannel[] = [...(inApp !== "off" ? [inApp] : []), ...(useEmail ? (["email"] as const) : [])];

  // When it goes: now, at a clock time, or timed to the event's start (C18; moves with the event).
  const offsetMinutes =
    timing === "event" && targetDef.needs === "event"
      ? Math.round(Number(offsetHours) * 60) * (offsetDir === "before" ? -1 : 1)
      : undefined;
  const at = timing === "at" ? scheduledAt : "";
  const later = !!at || offsetMinutes !== undefined;
  const whenText = at
    ? ` · ${new Date(at).toLocaleString("en-IN")}`
    : offsetMinutes !== undefined
      ? ` · ${relative(offsetMinutes)}, moving with the event`
      : "";

  useEffect(() => {
    if (!spaceId) return;
    void listTemplates(spaceId).then(({ data }) => data && setTemplates(data));
    void getSpaceEvents(spaceId, { limit: 100 }).then(
      ({ data }) => data && setEvents(data.events)
    );
    void getSpaceMembers(spaceId, { limit: 100 }).then(({ data }) => {
      if (data) setMembers(Array.isArray(data) ? data : data.members);
    });
  }, [spaceId]);

  const applyTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  };

  const audience = (): CampaignAudience => ({
    type: target,
    ...(targetDef.needs === "event" ? { eventId: targetId } : {}),
    ...(targetDef.needs === "member" ? { userIds: [targetId] } : {}),
  });

  // A push about an event opens it in the app.
  const event = events.find((e) => e.id === targetId);
  const buildMessage = (): CampaignMessage => ({
    channels,
    ...(inApp !== "off"
      ? {
          push: {
            title: title.trim(),
            body: message.trim(),
            ...(targetDef.needs === "event" && event ? { deepLink: `unifesto://event/${event.slug || event.id}` } : {}),
          },
        }
      : {}),
    ...(useEmail ? { email: { subject: subject.trim(), html: body } } : {}),
  });

  /** Fill the chosen channels from the line. Nothing is sent: the organiser reads and edits first. */
  const writeWithAi = async () => {
    setDrafting(true);
    setError(null);
    setAiNote([]);
    const { data, error } = await draftCampaign(spaceId, {
      line: line.trim(),
      channels,
      ...(targetDef.needs === "event" && targetId ? { eventId: targetId } : {}),
    });
    setDrafting(false);
    if (error || !data) return setError(error?.message ?? "The draft didn't come through. Try again.");
    if (!data.ok) return setError(draftProblem(data));
    if (data.draft.push) {
      setTitle(data.draft.push.title);
      setMessage(data.draft.push.body);
    }
    if (data.draft.email) {
      setSubject(data.draft.email.subject);
      setBody(data.draft.email.html);
    }
    setAiNote([
      "Drafted by AI from your line. Read every word before you send.",
      ...(data.dropped ?? []).map((d) => `Left out ${d}`),
    ]);
  };

  const doPreview = async () => {
    if (!spaceId) return;
    const { data, error } = await previewBody(spaceId, body);
    if (error) setError(error.message);
    else if (data) setPreview(data.html);
  };

  // Human-readable recap of the chosen audience for the review rail.
  const audienceLabel = (() => {
    if (targetDef.needs === "event") {
      if (!event) return null;
      return targetDef.label.includes("an event")
        ? targetDef.label.replace("an event", event.title)
        : `${targetDef.label} at ${event.title}`;
    }
    if (targetDef.needs === "member") {
      const m = members.find((x) => x.user.id === targetId);
      return m
        ? m.user.fullName ?? m.user.email ?? m.user.username ?? "A member"
        : null;
    }
    return targetDef.label;
  })();

  const missing = (): string | null => {
    if (channels.length === 0) return "Pick at least one channel.";
    if (inApp !== "off" && (!title.trim() || !message.trim())) return "Add the notification's title and message.";
    if (useEmail && (!subject.trim() || !body.trim())) return "Add the email's subject and body.";
    if (targetDef.needs && !targetId) return `Choose ${targetDef.needs === "event" ? "an event" : "a member"}.`;
    if (timing === "at" && !scheduledAt) return "Pick when to send it.";
    if (timing === "event" && targetDef.needs !== "event") return "Only a campaign to an event's people can be timed to its start.";
    if (timing === "event" && !(Number(offsetHours) >= 0)) return "Say how many hours from the start.";
    return null;
  };

  const submit = async () => {
    const why = missing();
    setError(why);
    if (why) return;
    const msg = buildMessage();
    const ok = await confirmDialog({
      title: later ? "Schedule this campaign?" : "Send this campaign now?",
      description: (
        <>
          <p>
            To: {audienceLabel ?? targetDef.label}
            {whenText}
          </p>
          <p>Nothing can be recalled once it goes. Unifesto checks it before it goes out.</p>
        </>
      ),
      load: async (): Promise<ReactNode> => {
        const { data, error } = await countCampaignReach(spaceId, { audience: audience(), channels });
        if (error || !data) throw new Error(error?.message ?? "Couldn't count the audience.");
        if (data.audience === 0) throw new Error("Nobody in this audience can get it right now.");
        return (
          <ul className="space-y-0.5 text-sm">
            <li>{data.audience} people in the audience</li>
            {channels.map((ch) => (
              <li key={ch}>
                {CHANNEL_LABEL[ch]}: {data[ch] ?? 0} {later ? "would get it now" : "get it"}
              </li>
            ))}
          </ul>
        );
      },
      confirmLabel: later ? "Schedule" : "Send now",
      test: {
        label: "Send a test to me",
        run: async () => {
          const { data, error } = await sendCampaignTest(spaceId, msg);
          if (error || !data) throw new Error(error?.message ?? "The test didn't send.");
          const sent = data.sent.map((ch) => CHANNEL_LABEL[ch]).join(", ");
          return [sent && `Sent to you: ${sent}.`, ...data.errors].filter(Boolean).join(" ");
        },
      },
    });
    if (!ok) return;
    setSubmitting(true);
    const { data, error } = await createCampaign(spaceId, {
      ...msg,
      audience: audience(),
      scheduledAt: at ? new Date(at).toISOString() : undefined,
      offsetMinutes,
      brief: aiNote.length ? line.trim() : undefined,
    });
    setSubmitting(false);
    if (error || !data) setError(error?.message ?? "It didn't send.");
    else if (data.status === "FAILED") setError(data.error ?? "No channel could send it.");
    else router.push("/console/campaigns");
  };

  const ready = missing() === null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="New campaign"
        subtitle="Write it once, then send it as a notification, an email, or both."
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Editor column */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" weight="duotone" />
                Audience and channels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="target">Send to</Label>
                <Select
                  value={target}
                  onValueChange={(v) => {
                    setTarget(v as Target);
                    setTargetId("");
                  }}
                >
                  <SelectTrigger id="target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGETS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {targetDef.needs === "event" && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-event">Event</Label>
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger id="new-event">
                      <SelectValue placeholder="Choose an event…" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {targetDef.needs === "member" && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-member">Member</Label>
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger id="new-member">
                      <SelectValue placeholder="Choose a member…" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.user.id} value={m.user.id}>
                          {m.user.fullName ?? m.user.email ?? m.user.username ?? m.user.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="in-app">In the app</Label>
                  <Select value={inApp} onValueChange={(v) => setInApp(v as InApp)}>
                    <SelectTrigger id="in-app">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="push">Push and in-app</SelectItem>
                      <SelectItem value="inapp">In-app only, no push</SelectItem>
                      <SelectItem value="off">Not in the app</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={useEmail}
                    onChange={(e) => setUseEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  Also send it as an email
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Each channel leaves out people who switched it off or unsubscribed. Attendees means confirmed attendees only.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkle className="h-4 w-4 text-primary" weight="duotone" />
                Write with AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  placeholder="One line, e.g. Hack Night moved to Hall B, same time"
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
                  It fills your channels from your line and the event, and adds no dates, prices or links you
                  didn&apos;t give. You still read and send it. Each draft uses one AI request.
                </p>
              )}
            </CardContent>
          </Card>

          {inApp !== "off" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BellRinging className="h-4 w-4 text-primary" weight="duotone" />
                  {inApp === "push" ? "Notification" : "In-app notice"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="push-title">Title</Label>
                  <Input id="push-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} placeholder="Doors open at 6" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="push-message">Message</Label>
                  <Textarea id="push-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder="Bring your ticket. Entry is from Gate 2." />
                </div>
                {(title.trim() || message.trim()) && (
                  <div className="rounded-xl bg-muted px-4 py-3 text-sm" aria-label="Notification preview">
                    <p className="font-semibold text-foreground">{title.trim() || "Title"}</p>
                    <p className="line-clamp-3 text-muted-foreground">{message.trim() || "Message"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {useEmail && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <EnvelopeSimple className="h-4 w-4 text-primary" weight="duotone" />
                  Email
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {templates.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="new-start-from-a-template">Start from a template</Label>
                    <Select onValueChange={applyTemplate}>
                      <SelectTrigger id="new-start-from-a-template">
                        <SelectValue placeholder="Choose a template…" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                            {t.scope === "GLOBAL" ? " · Global" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What's this email about?"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="body">Body</Label>
                  <EmailBodyEditor id="body" value={body} onChange={setBody} />
                </div>

                <Button variant="outline" onClick={doPreview} disabled={!body.trim()}>
                  <Eye className="mr-1.5 h-4 w-4" /> Preview
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Review & send rail */}
        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">Review &amp; send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-4 text-sm">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <dt className="text-eyebrow">Audience</dt>
                    <dd className="truncate text-foreground">
                      {audienceLabel ?? (
                        <span className="text-muted-foreground">
                          Choose {targetDef.needs === "event" ? "an event" : "a member"}
                        </span>
                      )}
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <PaperPlaneTilt className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <dt className="text-eyebrow">Channels</dt>
                    <dd className="text-foreground">
                      {channels.length ? channels.map((c) => CHANNEL_LABEL[c]).join(", ") : (
                        <span className="text-muted-foreground">None picked</span>
                      )}
                    </dd>
                  </div>
                </div>
              </dl>

              <div className="space-y-2 border-t border-border pt-4">
                <Label htmlFor="timing" className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> When
                </Label>
                <Select value={timing} onValueChange={(v) => setTiming(v as typeof timing)}>
                  <SelectTrigger id="timing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">Now</SelectItem>
                    <SelectItem value="at">At a set time</SelectItem>
                    <SelectItem value="event" disabled={targetDef.needs !== "event"}>
                      From the event start
                    </SelectItem>
                  </SelectContent>
                </Select>
                {timing === "at" && (
                  <Input
                    type="datetime-local"
                    aria-label="Send at"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                )}
                {timing === "event" && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      aria-label="Hours from the start"
                      value={offsetHours}
                      onChange={(e) => setOffsetHours(e.target.value)}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">h</span>
                    <Select value={offsetDir} onValueChange={(v) => setOffsetDir(v as typeof offsetDir)}>
                      <SelectTrigger aria-label="Before or after" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="before">before</SelectItem>
                        <SelectItem value="after">after</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {timing === "event"
                    ? "It moves if the event moves, is cancelled if the event is, and works out who's in the audience when it sends."
                    : "Up to 3 campaigns a day per event, or to the whole space."}
                </p>
              </div>

              <Button onClick={submit} disabled={submitting || !ready} className="w-full">
                {later ? (
                  <CalendarBlank className="mr-1.5 h-4 w-4" />
                ) : (
                  <PaperPlaneTilt className="mr-1.5 h-4 w-4" weight="fill" />
                )}
                {submitting
                  ? "Working…"
                  : later
                    ? "Schedule campaign"
                    : "Send now"}
              </Button>
              {!ready && (
                <p className="text-center text-xs text-muted-foreground">{missing()}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview (sample recipient)</DialogTitle>
          </DialogHeader>
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={preview ?? ""}
            className="h-[60vh] w-full rounded-md border border-border bg-white"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
