"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PaperPlaneTilt,
  Eye,
  Flask,
  ArrowLeft,
  Users,
  CalendarBlank,
  Clock,
} from "@unifesto/unicon/react";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import {
  createCampaign,
  previewBody,
  type EmailTargetType,
  type CreateCampaignPayload,
} from "@/lib/api/email-campaigns-api";
import { listTemplates, type EmailTemplate } from "@/lib/api/email-templates-api";
import { getSpaceEvents, type Event } from "@/lib/api/events-api";
import { getSpaceMembers, type SpaceMember } from "@/lib/api/spaces-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TARGETS: { value: EmailTargetType; label: string; needs?: "event" | "member" }[] = [
  { value: "SPACE_MEMBERS", label: "All space members" },
  { value: "EVENT_REGISTRANTS", label: "Registrants of an event", needs: "event" },
  { value: "WAITLIST", label: "Waitlist of an event", needs: "event" },
  { value: "SINGLE_USER", label: "A single member", needs: "member" },
];

const MERGE_VARS = ["{{firstName}}", "{{name}}", "{{email}}"];

export default function SpaceComposeCampaignPage() {
  const spaceId = useSpaceId();
  const router = useRouter();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<SpaceMember[]>([]);

  const [target, setTarget] = useState<EmailTargetType>("SPACE_MEMBERS");
  const [targetId, setTargetId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [abEnabled, setAbEnabled] = useState(false);
  const [subjectB, setSubjectB] = useState("");
  const [abSplitPct, setAbSplitPct] = useState(50);

  const [scheduledAt, setScheduledAt] = useState("");

  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetDef = TARGETS.find((t) => t.value === target)!;

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

  // Reset the id whenever the audience type changes.
  useEffect(() => {
    setTargetId("");
  }, [target]);

  const applyTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  };

  const buildPayload = (): CreateCampaignPayload => ({
    targetType: target,
    targetId: targetDef.needs ? targetId || undefined : undefined,
    subject: subject.trim(),
    subjectB: abEnabled && subjectB.trim() ? subjectB.trim() : undefined,
    abSplitPct: abEnabled ? abSplitPct : undefined,
    body,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
  });

  const doPreview = async () => {
    if (!spaceId) return;
    const { data, error } = await previewBody(spaceId, body);
    if (error) setError(error.message);
    else if (data) setPreview(data.html);
  };

  const submit = async () => {
    setError(null);
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required.");
      return;
    }
    if (targetDef.needs && !targetId) {
      setError(`Please choose ${targetDef.needs === "event" ? "an event" : "a member"}.`);
      return;
    }
    setSubmitting(true);
    const { error } = await createCampaign(spaceId, buildPayload());
    setSubmitting(false);
    if (error) setError(error.message);
    else router.push("/dashboard/email");
  };

  // Human-readable recap of the chosen audience for the review rail.
  const audienceLabel = useMemo(() => {
    if (targetDef.needs === "event") {
      const ev = events.find((e) => e.id === targetId);
      return ev ? `${targetDef.label.replace("an event", "")}${ev.title}` : null;
    }
    if (targetDef.needs === "member") {
      const m = members.find((x) => x.user.id === targetId);
      return m
        ? m.user.fullName ?? m.user.email ?? m.user.username ?? "A member"
        : null;
    }
    return targetDef.label;
  }, [targetDef, targetId, events, members]);

  const ready =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (!targetDef.needs || Boolean(targetId));

  const insertVar = (token: string) => setBody((b) => `${b}${token}`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Email"
        title="Compose campaign"
        subtitle="Pick an audience, write the email, optionally A/B-test the subject, then send or schedule."
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Editor column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" weight="duotone" />
                Audience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="target">Send to</Label>
                <Select value={target} onValueChange={(v) => setTarget(v as EmailTargetType)}>
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
                  <Label>Event</Label>
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger>
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
                  <Label>Member</Label>
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PaperPlaneTilt className="h-4 w-4 text-primary" weight="duotone" />
                Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {templates.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Start from a template</Label>
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger>
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
                <Label htmlFor="body">Body (HTML)</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  placeholder="<p>Hi {{firstName}}, …</p>"
                  className="font-mono text-xs"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Insert:</span>
                  {MERGE_VARS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVar(v)}
                      className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground transition-colors hover:border-border-strong hover:bg-secondary"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <Button variant="outline" onClick={doPreview} disabled={!body.trim()}>
                <Eye className="mr-1.5 h-4 w-4" /> Preview
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flask className="h-4 w-4 text-primary" weight="duotone" />
                A/B subject test
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={abEnabled}
                  onChange={(e) => setAbEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Test a second subject line
              </label>
              {abEnabled && (
                <div className="space-y-4 border-t border-border pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="subjectB">Subject B</Label>
                    <Input
                      id="subjectB"
                      value={subjectB}
                      onChange={(e) => setSubjectB(e.target.value)}
                      placeholder="Alternate subject"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="split">Split</Label>
                      <span className="text-xs text-muted-foreground">
                        A {abSplitPct}% · B {100 - abSplitPct}%
                      </span>
                    </div>
                    <input
                      id="split"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={abSplitPct}
                      onChange={(e) => setAbSplitPct(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Review & send rail */}
        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">Review &amp; send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-3 text-sm">
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
                    <dt className="text-eyebrow">Subject</dt>
                    <dd className="truncate text-foreground">
                      {subject.trim() || (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </dd>
                  </div>
                </div>

                {abEnabled && (
                  <div className="flex items-start gap-2">
                    <Flask className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <dt className="text-eyebrow">A/B test</dt>
                      <dd className="text-foreground">
                        On · A {abSplitPct}% / B {100 - abSplitPct}%
                      </dd>
                    </div>
                  </div>
                )}
              </dl>

              <div className="space-y-1.5 border-t border-border pt-4">
                <Label htmlFor="scheduledAt" className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Schedule for later
                </Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to send immediately.
                </p>
              </div>

              <Button onClick={submit} disabled={submitting || !ready} className="w-full">
                {scheduledAt ? (
                  <CalendarBlank className="mr-1.5 h-4 w-4" />
                ) : (
                  <PaperPlaneTilt className="mr-1.5 h-4 w-4" weight="fill" />
                )}
                {submitting
                  ? "Working…"
                  : scheduledAt
                    ? "Schedule campaign"
                    : "Send now"}
              </Button>
              {!ready && (
                <p className="text-center text-xs text-muted-foreground">
                  Add a subject, body, and audience to send.
                </p>
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
            srcDoc={preview ?? ""}
            className="h-[60vh] w-full rounded-md border border-border bg-white"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
