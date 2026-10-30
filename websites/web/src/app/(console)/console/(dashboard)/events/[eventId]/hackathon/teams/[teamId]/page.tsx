"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { IdentificationCard, Lightbulb, LockSimple, WarningCircle } from "@unifesto/unicon/react";
import { Badge } from "@/console/components/ui/badge";
import { Button } from "@/console/components/ui/button";
import { Card } from "@/console/components/ui/card";
import { Input } from "@/console/components/ui/input";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Field, FormCard, HackPage, Notice, hackBase } from "@/console/components/hackathon/HackParts";
import { getRooms, getTeam, updateTeam, type Room, type TeamDetail } from "@/console/lib/api/hackathon";

const NAME_SOURCE: Record<string, string> = {
  FORM: "From their registration",
  LEAD: "Set by the team lead",
  CURATOR: "Set by an organiser",
  DEFAULT: "Default name",
};

interface Draft {
  teamCode: string;
  name: string;
  roomId: string;
}

/**
 * One team (port of HackathonTeamEditorScreen): correct its Team ID or name,
 * move it to another room, see who is on it, and reach its problem statement.
 */
export default function HackathonTeamPage() {
  const { eventId, teamId } = useParams() as { eventId: string; teamId: string };
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const apply = useCallback((t: TeamDetail) => {
    const d = { teamCode: t.teamCode ?? "", name: t.name, roomId: t.room?.id ?? "" };
    setInitial(JSON.stringify(d));
    setTeam(t);
    setDraft(d);
  }, []);

  useEffect(() => {
    void Promise.all([getTeam(eventId, teamId), getRooms(eventId)]).then(([t, r]) => {
      if (!t.ok) return setError(t.message);
      if (r.ok) setRooms(r.data.rooms);
      apply(t.data);
    });
  }, [eventId, teamId, apply]);

  const set = (patch: Partial<Draft>) => {
    setError("");
    setNotice("");
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const back = { href: `${hackBase(eventId)}/teams`, label: "Teams" };
  if (!team || !draft) return <HackPage eventId={eventId} back={back} title="Team" error={error} ready={false} />;

  const cancelled = team.stage === "CANCELLED";
  const dirty = JSON.stringify(draft) !== initial;

  const save = async () => {
    const before = JSON.parse(initial) as Draft;
    const input: { teamCode?: string; name?: string; roomId?: string | null } = {};
    if (draft.teamCode.trim() !== before.teamCode) {
      if (!draft.teamCode.trim()) return setError("A team needs a Team ID.");
      input.teamCode = draft.teamCode.trim();
    }
    if (draft.name.trim() !== before.name) {
      if (!draft.name.trim()) return setError("Give the team a name.");
      input.name = draft.name.trim();
    }
    if (draft.roomId !== before.roomId) input.roomId = draft.roomId || null;
    setSaving(true);
    const res = await updateTeam(eventId, teamId, input);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    apply(res.data);
    setNotice("Team saved.");
    if (input.roomId !== undefined) {
      const r = await getRooms(eventId);
      if (r.ok) setRooms(r.data.rooms);
    }
  };

  const room = rooms.find((r) => r.id === draft.roomId);
  const joined = team.members.filter((m) => m.joined).length;

  return (
    <HackPage
      eventId={eventId}
      back={back}
      title={`${team.teamCode ? `${team.teamCode} · ` : ""}${team.name}`}
      error={error}
      ready
      actions={
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save team"}
        </Button>
      }
    >
      <Notice message={notice} />
      {cancelled && (
        <Card className="space-y-2 p-5">
          <Badge variant="destructive">Cancelled</Badge>
          <p className="text-sm text-muted-foreground">
            This team&apos;s registration was cancelled. It keeps {team.teamCode ?? "its Team ID"} and the ID is never given to another team. If the
            registration is restored, the team comes back as it was.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <FormCard title="Team">
          <Field label="Team ID">
            <Input value={draft.teamCode} onChange={(e) => set({ teamCode: e.target.value })} autoCapitalize="characters" />
          </Field>
          <Field label="Team name" hint={`${team.nameSource ? `${NAME_SOURCE[team.nameSource]}. ` : ""}Changing the name here overrides it.`}>
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          {!cancelled && (
            <Field
              label="Room"
              hint={
                room
                  ? `${room.occupied} of ${room.capacity} teams in ${room.name}${room.location ? ` · ${room.location}` : ""}. The team is notified when you save.`
                  : "The team is notified when you put it in a room."
              }
            >
              <select
                value={draft.roomId}
                onChange={(e) => set({ roomId: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
              >
                <option value="">{rooms.length ? "No room" : "Add rooms first"}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.occupied}/{r.capacity})
                  </option>
                ))}
              </select>
            </Field>
          )}
        </FormCard>

        <div className="space-y-4">
          {(!cancelled || team.statement) && (
            <ListGroup
              title="Problem statement"
              description={
                team.statement?.changedAfterEvalAt ? (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <WarningCircle className="h-3.5 w-3.5" weight="fill" /> Changed after evaluation. Earlier marks were kept.
                  </span>
                ) : team.statement ? (
                  team.statement.setBy?.kind === "ORGANISER" ? (
                    "Assigned by organisers. Locked for the team."
                  ) : (
                    `Locked in by ${team.statement.setBy?.name ?? "the team"}. Only organisers can change it.`
                  )
                ) : (
                  "The team can't be judged until it has one."
                )
              }
            >
              <ListRow
                icon={team.statement ? <LockSimple className="h-5 w-5" weight="fill" /> : <Lightbulb className="h-5 w-5" weight="fill" />}
                label={team.statement ? [team.statement.code, team.statement.title].filter(Boolean).join(" · ") : "Not chosen yet"}
                value={team.statement?.themeLabel ?? (cancelled ? undefined : "Assign")}
                href={`${hackBase(eventId)}/teams/${teamId}/statement`}
              />
            </ListGroup>
          )}

          <ListGroup
            title={`Members · ${joined} of ${team.members.length} joined`}
            description="Members see the hackathon once they claim their seat in the app. The lead can invite people from their ticket."
          >
            {team.members.map((m) => (
              <ListRow
                key={m.seat}
                label={m.name || `Seat ${m.seat}`}
                value={[m.isLead ? "Lead" : "", m.joined ? "" : "Not joined yet"].filter(Boolean).join(" · ") || undefined}
              />
            ))}
          </ListGroup>

          {team.registrationId && (
            <ListGroup>
              <ListRow
                icon={<IdentificationCard className="h-5 w-5" weight="fill" />}
                label="Open the registration"
                href={`/console/events/${eventId}/attendees/${team.registrationId}`}
              />
            </ListGroup>
          )}
        </div>
      </div>
    </HackPage>
  );
}
