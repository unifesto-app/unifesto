"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import {
  createSession,
  PLATFORM_LABELS,
  type SessionPlatform,
  type SessionVisibility,
  type CreateSessionPayload,
} from "@/lib/api/sessions-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PLATFORMS: SessionPlatform[] = [
  "UNIFESTO_LIVE",
  "GOOGLE_MEET",
  "ZOOM",
  "MS_TEAMS",
  "OTHER",
];

const VISIBILITY: { value: SessionVisibility; label: string; hint: string }[] =
  [
    { value: "PUBLIC", label: "Public", hint: "Anyone can discover it" },
    {
      value: "UNLISTED",
      label: "Unlisted",
      hint: "Only people with the link",
    },
  ];

const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function NewSessionPage() {
  const router = useRouter();
  const spaceId = useSpaceId();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState<SessionPlatform>("UNIFESTO_LIVE");
  const [platformOther, setPlatformOther] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [interactive, setInteractive] = useState(true);
  const [startDateTime, setStartDateTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [visibility, setVisibility] = useState<SessionVisibility>("PUBLIC");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const isLive = platform === "UNIFESTO_LIVE";

    if (!title.trim()) return setError("Give your session a title.");
    if (!isLive && !meetingUrl.trim())
      return setError("Add a meeting link.");
    if (!startDateTime) return setError("Pick a start date and time.");
    if (platform === "OTHER" && !platformOther.trim())
      return setError("Name the platform you're using.");

    const payload: CreateSessionPayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      platform,
      platformOther:
        platform === "OTHER" ? platformOther.trim() : undefined,
      // Live sessions have no external link — the room is hosted in-app.
      meetingUrl: isLive ? undefined : meetingUrl.trim(),
      interactive: isLive ? interactive : undefined,
      // datetime-local is wall-clock; send as ISO so the backend stores an instant.
      startDateTime: new Date(startDateTime).toISOString(),
      durationMinutes,
      capacity: capacity ? Number(capacity) : undefined,
      price: price ? Number(price) : 0,
      visibility,
    };

    setSaving(true);
    const { data, error } = await createSession(spaceId, payload);
    setSaving(false);

    if (error) return setError(error.message);
    router.push(`/dashboard/sessions/${data!.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New session"
        subtitle="A quick online gathering — set it up in under a minute"
        actions={
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/sessions`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Breaking into Product Management"
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will you cover? Who's it for?"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where & when</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select
                  value={platform}
                  onValueChange={(v) =>
                    setPlatform(v as SessionPlatform)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {platform === "OTHER" && (
                <div className="space-y-2">
                  <Label htmlFor="platformOther">Platform name</Label>
                  <Input
                    id="platformOther"
                    value={platformOther}
                    onChange={(e) => setPlatformOther(e.target.value)}
                    placeholder="e.g. Discord Stage"
                  />
                </div>
              )}
            </div>

            {platform === "UNIFESTO_LIVE" ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-sm font-medium text-foreground">
                    Hosted in-app — no link to share
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Attendees join inside Unifesto with a personal, expiring
                    pass. There&apos;s no meeting URL that can be forwarded, and
                    you can open the room from the session page to go live.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select
                    value={interactive ? "interactive" : "broadcast"}
                    onValueChange={(v) => setInteractive(v === "interactive")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interactive">
                        Interactive — attendees can speak &amp; share video
                      </SelectItem>
                      <SelectItem value="broadcast">
                        Broadcast — only hosts are seen &amp; heard
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="meetingUrl">Meeting link</Label>
                <Input
                  id="meetingUrl"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/…"
                />
                <p className="text-xs text-muted-foreground">
                  Hidden from attendees until they register, and only opens 15
                  minutes before start.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start">Starts</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select
                  value={String(durationMinutes)}
                  onValueChange={(v) => setDurationMinutes(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price">Price (₹)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0 for free"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity</Label>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Leave blank for unlimited"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(v) =>
                  setVisibility(v as SessionVisibility)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label} — {v.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/sessions`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create session"}
          </Button>
        </div>
      </form>
    </div>
  );
}
