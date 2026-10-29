"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Megaphone } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Card } from "@/console/components/ui/card";
import { Input } from "@/console/components/ui/input";
import { Textarea } from "@/console/components/ui/textarea";
import { Chips, Field, FormCard, HackPage, Notice, useResult } from "@/console/components/hackathon/HackParts";
import { getAnnouncements, sendAnnouncement, type AnnouncementAudience, type Announcements } from "@/console/lib/api/hackathon";
import { formatWhen } from "@/console/lib/hackathon";

const AUDIENCES: { value: AnnouncementAudience; label: string; hint: string }[] = [
  { value: "ALL", label: "Everyone", hint: "Every team member, judge and mentor." },
  { value: "TEAMS", label: "Teams", hint: "Every member of every team." },
  { value: "JUDGES", label: "Judges and mentors", hint: "Only judges and mentors." },
  { value: "ROOM", label: "One room", hint: "Members of the teams in one room." },
];

const audienceLabel = (a: Announcements["announcements"][number]) =>
  a.audience === "ROOM" ? a.roomName ?? "A room" : AUDIENCES.find((x) => x.value === a.audience)?.label ?? a.audience;

/**
 * Send an announcement (push + in-app updates feed) to everyone, only teams,
 * judges and mentors, or one room; and see what was sent (port of HackathonAnnounceScreen).
 */
export default function HackathonAnnouncePage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getAnnouncements(eventId), [eventId]);
  const { data, setData, error, setError } = useResult(fetcher);
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const [roomId, setRoomId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  if (!data) return <HackPage eventId={eventId} title="Announcements" error={error} ready={false} />;

  const send = async () => {
    setNotice("");
    if (!title.trim()) return setError('Add a title, like "Lunch is served".');
    if (!body.trim()) return setError("Write the message.");
    if (audience === "ROOM" && !roomId) return setError("Pick the room.");
    const who = audience === "ROOM" ? data.rooms.find((r) => r.id === roomId)?.name : AUDIENCES.find((a) => a.value === audience)?.label.toLowerCase();
    if (!window.confirm(`Send to ${who}? It goes out as a notification and stays in their updates.`)) return;
    setSending(true);
    const res = await sendAnnouncement(eventId, { audience, ...(audience === "ROOM" ? { roomId } : {}), title: title.trim(), body: body.trim() });
    setSending(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
    setTitle("");
    setBody("");
    setError("");
    const sent = res.data.announcements[0];
    setNotice(`Sent. ${sent?.recipients ?? 0} ${sent?.recipients === 1 ? "person" : "people"} will get it.`);
  };

  return (
    <HackPage eventId={eventId} title="Announcements" subtitle="Goes out as a push notification and stays in everyone's updates." error={error} ready>
      <Notice message={notice} />
      <div className="grid gap-6 lg:grid-cols-2">
        <FormCard title="New announcement">
          <Field label="Send to">
            <Chips
              options={AUDIENCES}
              value={audience}
              onChange={(v) => {
                setAudience(v);
                setError("");
              }}
            />
          </Field>
          {audience === "ROOM" &&
            (data.rooms.length ? (
              <Chips options={data.rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.teams})` }))} value={roomId} onChange={setRoomId} />
            ) : (
              <p className="text-sm text-warning">Add rooms first.</p>
            ))}
          <Field label="Title">
            <Input value={title} maxLength={120} placeholder="Lunch is served" onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Message">
            <Textarea
              rows={5}
              value={body}
              maxLength={2000}
              placeholder="Head to the atrium. Veg and non-veg counters are on the left."
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <Button onClick={send} disabled={sending}>
            <Megaphone className="h-4 w-4" weight="fill" /> {sending ? "Sending…" : "Send announcement"}
          </Button>
        </FormCard>

        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-foreground">Sent</h2>
          {data.announcements.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nothing sent yet.</p>}
          {data.announcements.map((a) => (
            <Card key={a.id} className="space-y-1.5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Megaphone className="h-4 w-4" weight="fill" /> {a.title}
              </p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
              <p className="text-xs text-muted-foreground">
                {audienceLabel(a)} · {a.recipients} {a.recipients === 1 ? "person" : "people"} · {formatWhen(a.createdAt)}
                {a.sentBy ? ` · ${a.sentBy}` : ""}
              </p>
            </Card>
          ))}
        </section>
      </div>
    </HackPage>
  );
}
