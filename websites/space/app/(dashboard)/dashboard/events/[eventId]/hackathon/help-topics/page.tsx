"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Field, FormCard, HackPage, MultiChips, hackBase, useResult } from "@/console/components/hackathon/HackParts";
import { createHelpTopic, deleteHelpTopic, getHelpTopics, staffName, updateHelpTopic, type HelpTopics } from "@/console/lib/api/hackathon";

type Topic = HelpTopics["topics"][number];

/**
 * Help topics teams raise queries under ("Food", "Wi-Fi"), each with its points
 * of contact (port of HackathonHelpTopicsScreen). A query goes to the topic's
 * POCs and the volunteers in the team's room; "Other" goes to the curators.
 */
export default function HelpTopicsPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getHelpTopics(eventId), [eventId]);
  const { data, setData, error, setError } = useResult(fetcher);
  /** The topic being edited; null = the form adds a new one. */
  const [editing, setEditing] = useState<Topic | null>(null);
  const [name, setName] = useState("");
  const [pocs, setPocs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEditing(null);
    setName("");
    setPocs([]);
    setError("");
  };

  const save = async () => {
    if (!name.trim()) return setError('Name the topic, like "Food".');
    setBusy(true);
    const input = { name: name.trim(), pocUserIds: pocs };
    const res = editing ? await updateHelpTopic(eventId, editing.id, input) : await createHelpTopic(eventId, input);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
    reset();
  };

  const remove = async (t: Topic) => {
    if (!window.confirm(`Delete ${t.name}? Past queries keep the topic name. Teams can't raise new ones under it.`)) return;
    setBusy(true);
    const res = await deleteHelpTopic(eventId, t.id);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
    reset();
  };

  return (
    <HackPage eventId={eventId} title="Help topics" subtitle="What teams can ask for help with, and who answers." error={error} ready={!!data}>
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <FormCard
            title={editing ? `Edit ${editing.name}` : "Add a topic"}
            description="Queries under this topic go to these people and to the volunteers in the team's room. With nobody picked, they go to the curators."
          >
            <Field label="Topic">
              <Input value={name} maxLength={60} placeholder="Food" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Points of contact">
              {data.staff.length ? (
                <MultiChips options={data.staff.map((u) => ({ value: u.id, label: staffName(u) }))} value={pocs} onChange={setPocs} />
              ) : (
                <Link href={`/dashboard/events/${eventId}/team`} className="text-sm text-foreground underline">
                  Add people to the event team first
                </Link>
              )}
            </Field>
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy || !name.trim()}>
                {editing ? "Save" : "Add topic"}
              </Button>
              {editing && (
                <Button variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </FormCard>

          {data.topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No topics yet. Teams can still raise &quot;Other&quot; queries, which go to the curators.</p>
          ) : (
            <ListGroup
              title="Topics"
              action={
                <Link href={`${hackBase(eventId)}/help-desk`} className="text-xs text-muted-foreground hover:text-foreground">
                  Queries from teams →
                </Link>
              }
            >
              {data.topics.map((t) => (
                <div key={t.id} className="flex items-center gap-2 pr-3">
                  <div className="min-w-0 flex-1">
                    <ListRow label={t.name} sublabel={t.pocs.length ? t.pocs.map(staffName).join(", ") : "Curators"} />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(t);
                      setName(t.name);
                      setPocs(t.pocs.map((p) => p.id));
                      setError("");
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void remove(t)}>
                    Delete
                  </Button>
                </div>
              ))}
            </ListGroup>
          )}
        </div>
      )}
    </HackPage>
  );
}
