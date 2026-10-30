"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PaperPlaneTilt, Eye, Flask, ArrowLeft } from "@unifesto/unicon/react";
import {
  countAudience,
  createCampaign,
  previewBody,
  sendTestEmail,
  type EmailTargetType,
  type CreateCampaignPayload,
} from "@/lib/api/email-campaigns-api";
import { listTemplates, type EmailTemplate } from "@/lib/api/email-templates-api";
import { getUsers } from "@/lib/api/admin-users-api";
import { getAllEventsAdmin } from "@/lib/api/admin-events-api";
import { getAllSpacesAdmin } from "@/lib/api/spaces-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { audienceLine, confirmDialog } from "@/components/shared/ConfirmDialog";
import { EntitySearchSelect } from "@/components/shared/EntitySearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

// Platform targets. Those needing an id show a field; SEGMENT shows filters.
const TARGETS: { value: EmailTargetType; label: string; needsId?: "event" | "space" | "user" }[] = [
  { value: "ALL_USERS", label: "All users" },
  { value: "ORGANISERS_ONLY", label: "Organisers only" },
  { value: "SEGMENT", label: "Segment (filtered)" },
  { value: "SPACE_MEMBERS", label: "Members of a space", needsId: "space" },
  { value: "EVENT_REGISTRANTS", label: "Registrants of an event", needsId: "event" },
  { value: "WAITLIST", label: "Waitlist of an event", needsId: "event" },
  { value: "SINGLE_USER", label: "A single user", needsId: "user" },
  { value: "STAFF", label: "Staff only (test run)" },
];

export default function ComposeCampaignPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [target, setTarget] = useState<EmailTargetType>("ALL_USERS");
  const [targetId, setTargetId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // A/B
  const [abEnabled, setAbEnabled] = useState(false);
  const [subjectB, setSubjectB] = useState("");
  const [abSplitPct, setAbSplitPct] = useState(50);

  // Segment filters
  const [hasRegistrations, setHasRegistrations] = useState(false);
  const [joinedAfter, setJoinedAfter] = useState("");

  // Schedule
  const [scheduledAt, setScheduledAt] = useState("");

  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetDef = TARGETS.find((t) => t.value === target)!;

  useEffect(() => {
    void listTemplates().then(({ data }) => data && setTemplates(data));
  }, []);

  // Clear any picked id when the audience type changes.
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
    targetId: targetDef.needsId ? targetId.trim() || undefined : undefined,
    subject: subject.trim(),
    subjectB: abEnabled && subjectB.trim() ? subjectB.trim() : undefined,
    abSplitPct: abEnabled ? abSplitPct : undefined,
    body,
    segmentFilters:
      target === "SEGMENT"
        ? {
            hasRegistrations: hasRegistrations || undefined,
            joinedAfter: joinedAfter ? new Date(joinedAfter).toISOString() : undefined,
          }
        : undefined,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
  });

  const doPreview = async () => {
    const { data, error } = await previewBody(body);
    if (error) setError(error.message);
    else if (data) setPreview(data.html);
  };

  const submit = async () => {
    setError(null);
    if (!subject.trim() || !body.trim()) {
      setError("Subject and body are required.");
      return;
    }
    if (targetDef.needsId && !targetId.trim()) {
      setError(`This audience needs a ${targetDef.needsId} id.`);
      return;
    }
    const payload = buildPayload();
    const ok = await confirmDialog({
      title: scheduledAt ? "Schedule this campaign?" : "Send this campaign now?",
      description: (
        <>
          <p>
            &ldquo;{payload.subject}&rdquo; to {targetDef.label.toLowerCase()}
            {scheduledAt ? `, on ${new Date(scheduledAt).toLocaleString("en-IN")}` : ""}.
          </p>
          <p>Emails can&apos;t be recalled once sent.</p>
        </>
      ),
      load: () => audienceLine(countAudience(payload), scheduledAt ? "Would go to" : "Goes to"),
      confirmLabel: scheduledAt ? "Schedule" : "Send now",
      test: {
        label: "Send a test to me",
        run: async () => {
          const { data, error } = await sendTestEmail({ subject: payload.subject, body: payload.body });
          if (error || !data) throw new Error(error?.message ?? "The test didn't send.");
          return `Test sent to ${data.sentTo}.`;
        },
      },
    });
    if (!ok) return;
    setSubmitting(true);
    const { error } = await createCampaign(payload);
    setSubmitting(false);
    if (error) setError(error.message);
    else router.push("/dashboard/email");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Compose campaign"
        subtitle="Pick an audience, write the email, optionally A/B-test the subject, then send or schedule."
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      {/* Audience */}
      <Card>
        <CardHeader>
          <CardTitle>Audience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
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
            <p className="mt-1.5 text-xs text-muted-foreground">
              People who unsubscribed or turned email off are left out. Bulk sends only reach people who opted in to promotions.
            </p>
          </div>

          {targetDef.needsId === "user" && (
            <div>
              <Label htmlFor="email-target-user">User</Label>
              <EntitySearchSelect
                id="email-target-user"
                key="user"
                placeholder="Search by name, email, or phone…"
                onChange={(id) => setTargetId(id ?? "")}
                search={async (q) => {
                  const { data } = await getUsers({ search: q, limit: 8 });
                  return data?.users ?? [];
                }}
                getId={(u) => u.id}
                getPrimary={(u) => u.fullName || u.username || "Unnamed"}
                getSecondary={(u) => u.email || u.mobileNumber || u.id}
              />
            </div>
          )}

          {targetDef.needsId === "event" && (
            <div>
              <Label htmlFor="email-target-event">Event</Label>
              <EntitySearchSelect
                id="email-target-event"
                key="event"
                placeholder="Search events by title…"
                onChange={(id) => setTargetId(id ?? "")}
                search={async (q) => {
                  const { data } = await getAllEventsAdmin({ search: q, limit: 8 });
                  return data?.events ?? [];
                }}
                getId={(e) => e.id}
                getPrimary={(e) => e.title}
                getSecondary={(e) => e.space?.name ?? e.slug}
              />
            </div>
          )}

          {targetDef.needsId === "space" && (
            <div>
              <Label htmlFor="email-target-space">Space</Label>
              <EntitySearchSelect
                id="email-target-space"
                key="space"
                placeholder="Search spaces by name…"
                onChange={(id) => setTargetId(id ?? "")}
                search={async (q) => {
                  const { data } = await getAllSpacesAdmin({ search: q, limit: 8 });
                  return data?.spaces ?? [];
                }}
                getId={(s) => s.id}
                getPrimary={(s) => s.name}
                getSecondary={(s) => `@${s.slug}`}
              />
            </div>
          )}

          {target === "SEGMENT" && (
            <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="joinedAfter">Joined after</Label>
                <Input
                  id="joinedAfter"
                  type="date"
                  value={joinedAfter}
                  onChange={(e) => setJoinedAfter(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasRegistrations}
                  onChange={(e) => setHasRegistrations(e.target.checked)}
                />
                Has registrations
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.length > 0 && (
            <div>
              <Label htmlFor="new-start-from-a-template">Start from a template</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger id="new-start-from-a-template">
                  <SelectValue placeholder="Choose a global template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's this email about?"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Body (HTML)</Label>
              <span className="text-xs text-muted-foreground">
                Merge vars: {"{{firstName}}"}, {"{{name}}"}, {"{{email}}"}
              </span>
            </div>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              placeholder="<p>Hi {{firstName}}, …</p>"
              className="font-mono text-xs"
            />
          </div>

          <Button variant="outline" onClick={doPreview} disabled={!body.trim()}>
            <Eye className="mr-1.5 h-4 w-4" /> Preview
          </Button>
        </CardContent>
      </Card>

      {/* A/B */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flask className="h-4 w-4" /> A/B subject test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={abEnabled}
              onChange={(e) => setAbEnabled(e.target.checked)}
            />
            Test a second subject line
          </label>
          {abEnabled && (
            <>
              <div>
                <Label htmlFor="subjectB">Subject B</Label>
                <Input
                  id="subjectB"
                  value={subjectB}
                  onChange={(e) => setSubjectB(e.target.value)}
                  placeholder="Alternate subject"
                />
              </div>
              <div>
                <Label htmlFor="split">Send subject A to {abSplitPct}% of recipients</Label>
                <input
                  id="split"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={abSplitPct}
                  onChange={(e) => setAbSplitPct(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Schedule + send */}
      <Card>
        <CardHeader>
          <CardTitle>Send</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="scheduledAt">Schedule for later (optional)</Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <Button onClick={submit} disabled={submitting}>
            <PaperPlaneTilt className="mr-1.5 h-4 w-4" />
            {submitting
              ? "Working…"
              : scheduledAt
                ? "Schedule campaign"
                : "Send now"}
          </Button>
        </CardContent>
      </Card>

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
