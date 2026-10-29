"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Textarea } from "@/console/components/ui/textarea";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Field, FormCard, HackPage, MultiChips, hackBase } from "@/console/components/hackathon/HackParts";
import { createRoom, deleteRoom, getRooms, staffName, updateRoom, type Room, type StaffUser } from "@/console/lib/api/hackathon";

interface Draft {
  name: string;
  location: string;
  capacity: string;
  notes: string;
  volunteerUserIds: string[];
}
const EMPTY: Draft = { name: "", location: "", capacity: "", notes: "", volunteerUserIds: [] };

/** Add or edit a room: name, where it is, capacity, notes for teams, volunteers (port of HackathonRoomEditorScreen). */
export default function RoomEditorPage() {
  const { eventId, roomId } = useParams() as { eventId: string; roomId: string };
  const isNew = roomId === "new";
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const [initial, setInitial] = useState(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const listHref = `${hackBase(eventId)}/rooms`;

  useEffect(() => {
    void getRooms(eventId).then((r) => {
      if (r.ok) setStaff(r.data.staff);
      if (isNew) return;
      const found = r.ok ? r.data.rooms.find((x) => x.id === roomId) : undefined;
      if (!found) return setError("This room no longer exists.");
      const d = {
        name: found.name,
        location: found.location ?? "",
        capacity: String(found.capacity),
        notes: found.notes ?? "",
        volunteerUserIds: found.volunteers.map((v) => v.id),
      };
      setInitial(JSON.stringify(d));
      setRoom(found);
      setDraft(d);
    });
  }, [isNew, eventId, roomId]);

  const title = isNew ? "New room" : room?.name ?? "Room";
  const back = { href: listHref, label: "Rooms" };
  if (!draft) return <HackPage eventId={eventId} back={back} title={title} error={error} ready={false} />;

  const set = (patch: Partial<Draft>) => {
    setError("");
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const dirty = isNew || JSON.stringify(draft) !== initial;

  const save = async () => {
    const capacity = Number(draft.capacity);
    if (!draft.name.trim()) return setError('Name the room, like "Lab 2".');
    if (!Number.isInteger(capacity) || capacity < 1) return setError("How many teams fit? At least 1.");
    const body = {
      name: draft.name.trim(),
      location: draft.location.trim() || null,
      capacity,
      notes: draft.notes.trim() || null,
      volunteerUserIds: draft.volunteerUserIds,
    };
    setSaving(true);
    const res = isNew ? await createRoom(eventId, body) : await updateRoom(eventId, roomId, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${room?.name}? Only an empty room can be deleted. Move its teams to another room first.`)) return;
    setDeleting(true);
    const res = await deleteRoom(eventId, roomId);
    setDeleting(false);
    if (!res.ok) return setError(res.message);
    router.push(listHref);
  };

  return (
    <HackPage
      eventId={eventId}
      back={back}
      title={title}
      error={error}
      ready
      actions={
        <Button onClick={save} disabled={!dirty || saving || deleting}>
          {saving ? "Saving…" : isNew ? "Add room" : "Save room"}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <FormCard description="Teams see the name, location and notes on their hackathon screen.">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Name">
              <Input value={draft.name} placeholder="Lab 2" onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Teams it fits">
              <Input inputMode="numeric" value={draft.capacity} placeholder="8" onChange={(e) => set({ capacity: e.target.value })} />
            </Field>
          </div>
          <Field label="Where it is (optional)">
            <Input value={draft.location} placeholder="Block C, 2nd floor" onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label="Notes for teams (optional)">
            <Textarea value={draft.notes} placeholder="Wi-Fi: HackNet · Power strips at every table" onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </FormCard>
        <div className="space-y-6">
          <FormCard title="Volunteers here" description="Teams in this room see their volunteers, and every query they raise goes to them too.">
            {staff.length ? (
              <MultiChips
                options={staff.map((u) => ({ value: u.id, label: staffName(u) }))}
                value={draft.volunteerUserIds}
                onChange={(v) => set({ volunteerUserIds: v })}
              />
            ) : (
              <Link href={`/console/events/${eventId}/team`} className="text-sm text-foreground underline">
                Add people to the event team first
              </Link>
            )}
          </FormCard>
          {room && (
            <ListGroup title={`Teams here · ${room.occupied} of ${room.capacity}`}>
              {room.teams.length === 0 && <ListRow label="No teams yet" />}
              {room.teams.map((t) => (
                <ListRow key={t.id} label={`${t.teamCode ?? "—"}  ${t.name}`} href={`${hackBase(eventId)}/teams/${t.id}`} />
              ))}
            </ListGroup>
          )}
        </div>
      </div>
      {!isNew && (
        <Button variant="outline" className="text-destructive" onClick={remove} disabled={saving || deleting}>
          <Trash className="h-4 w-4" weight="bold" /> {deleting ? "Deleting…" : "Delete room"}
        </Button>
      )}
    </HackPage>
  );
}
