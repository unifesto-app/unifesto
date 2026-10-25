"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Chips, Field, FormCard, HackPage, Toggle, fromLocalInput, hackBase, toLocalInput } from "@/components/hackathon/HackParts";
import { getHackathonOverview, updateHackathonConfig, type HackathonOverview, type PsMode, type ThemeMode } from "@/lib/api/hackathon";
import { PS_MODE_OPTIONS, TEAM_CODE_PREFIX_RE, THEME_MODE_OPTIONS, formatTeamCode } from "@/lib/hackathon";

const DIGITS = ["1", "2", "3", "4", "5", "6"].map((d) => ({ value: d, label: d }));
const LEAD_NAMES = "__lead__";

interface Draft {
  prefix: string;
  digits: string;
  next: string;
  teamNameFieldId: string;
  venueName: string;
  venueAddress: string;
  venueMapUrl: string;
  venueNotes: string;
  psMode: PsMode | "OFF";
  themeMode: ThemeMode;
  /** ISO; '' = no deadline. */
  psDeadline: string;
}

/** Tomorrow, 6 pm: a sensible first deadline. */
const defaultDeadline = () => {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
};

const toDraft = (o: HackathonOverview): Draft => ({
  prefix: o.hackathon?.teamCodePrefix ?? "",
  digits: String(o.hackathon?.teamCodeDigits ?? 3),
  next: String(o.hackathon?.teamCodeNext ?? 1),
  teamNameFieldId: o.hackathon?.teamNameFieldId ?? LEAD_NAMES,
  venueName: o.hackathon?.venue.name ?? "",
  venueAddress: o.hackathon?.venue.address ?? "",
  venueMapUrl: o.hackathon?.venue.mapUrl ?? "",
  venueNotes: o.hackathon?.venue.notes ?? "",
  psMode: o.hackathon?.psMode ?? "OFF",
  themeMode: o.hackathon?.themeMode ?? "LIST",
  psDeadline: o.hackathon?.psDeadline ?? "",
});

/**
 * Hackathon settings (port of HackathonSettingsScreen): Team ID format with a
 * live preview, where team names come from, how teams get their problem
 * statement and theme (with an optional deadline), and the venue.
 */
export default function HackathonSettingsPage() {
  const eventId = useParams().eventId as string;
  const router = useRouter();
  const [overview, setOverview] = useState<HackathonOverview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getHackathonOverview(eventId).then((r) => {
      if (!r.ok) return setError(r.message);
      const d = toDraft(r.data);
      setInitial(JSON.stringify(d));
      setOverview(r.data);
      setDraft(d);
    });
  }, [eventId]);

  const set = (patch: Partial<Draft>) => {
    setError("");
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  if (!draft || !overview) return <HackPage eventId={eventId} title="Hackathon settings" error={error} ready={false} />;

  const dirty = JSON.stringify(draft) !== initial;
  const currentNext = overview.hackathon?.teamCodeNext ?? 1;
  const prefix = draft.prefix.trim();
  const digits = Number(draft.digits);
  const next = Number(draft.next);
  const prefixOk = !prefix || TEAM_CODE_PREFIX_RE.test(prefix);
  const preview =
    prefix && prefixOk && Number.isInteger(next) && next >= 1
      ? [0, 1, 2].map((i) => formatTeamCode(prefix, digits, next + i)).join(", ") + "…"
      : null;
  const ev = overview.eventVenue;
  const teamsChoose = draft.psMode === "TEAM_PICKS" || draft.psMode === "TEAM_WRITES";
  const opening = teamsChoose && !(overview.hackathon?.psMode === "TEAM_PICKS" || overview.hackathon?.psMode === "TEAM_WRITES");
  const eventVenue = [ev.name, ev.address].filter(Boolean).join(", ");

  const save = async () => {
    if (!prefixOk) return setError("The prefix uses letters, numbers and - _ / . (no spaces), up to 20.");
    if (!Number.isInteger(next) || next < currentNext) {
      return setError(`The next number can only move forward (it's at ${currentNext}), so no Team ID is ever reused.`);
    }
    const toBody = (d: Draft) => ({
      teamCodePrefix: d.prefix.trim() || null,
      teamCodeDigits: Number(d.digits),
      teamCodeNext: Number(d.next),
      teamNameFieldId: d.teamNameFieldId === LEAD_NAMES ? null : d.teamNameFieldId,
      venueName: d.venueName.trim() || null,
      venueAddress: d.venueAddress.trim() || null,
      venueMapUrl: d.venueMapUrl.trim() || null,
      venueNotes: d.venueNotes.trim() || null,
      psMode: d.psMode === "OFF" ? null : d.psMode,
      themeMode: d.themeMode,
      psDeadline: (d.psMode === "TEAM_PICKS" || d.psMode === "TEAM_WRITES") && d.psDeadline ? d.psDeadline : null,
    });
    // Send only what this curator changed, so a page opened a while ago can't
    // write back settings someone else has changed since.
    const was = toBody(JSON.parse(initial) as Draft);
    const changes: Partial<ReturnType<typeof toBody>> = Object.fromEntries(
      Object.entries(toBody(draft)).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(was[k as keyof typeof was]))
    );
    setSaving(true);
    const res = await updateHackathonConfig(eventId, changes);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.push(hackBase(eventId));
  };

  const nameOptions = [
    { value: LEAD_NAMES, label: "Team lead names it" },
    ...overview.teamNameFields.map((f) => ({ value: f.id, label: f.ticketTypeName ? `${f.label} (${f.ticketTypeName})` : f.label })),
  ];

  return (
    <HackPage
      eventId={eventId}
      title="Hackathon settings"
      error={error}
      ready
      actions={
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <FormCard title="Team ID" description="Teams keep their ID for good, even if their registration is cancelled. Changing the format only affects teams imported after the change.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prefix">
              <Input value={draft.prefix} onChange={(e) => set({ prefix: e.target.value })} placeholder="HACK25-" autoCapitalize="characters" />
            </Field>
            <Field label="Next number">
              <Input inputMode="numeric" value={draft.next} onChange={(e) => set({ next: e.target.value })} />
            </Field>
          </div>
          <Field label="Digits">
            <Chips options={DIGITS} value={draft.digits} onChange={(v) => set({ digits: v })} />
          </Field>
          <p className={prefixOk ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
            {!prefixOk
              ? "Use letters, numbers and - _ / . with no spaces."
              : preview
                ? `Next teams get ${preview}`
                : "Set a prefix to start handing out Team IDs."}
          </p>
        </FormCard>

        <FormCard title="Team names">
          <Chips options={nameOptions} value={draft.teamNameFieldId} onChange={(v) => set({ teamNameFieldId: v })} />
          <p className="text-xs text-muted-foreground">
            {overview.teamNameFields.length
              ? "Pick a registration question asked once per group to use its answer as the team name. Otherwise the name starts as “<lead>’s team” and the lead can change it."
              : "To collect team names at registration, add a text question asked once per group on your group ticket. Until then the lead names the team in the app."}
          </p>
        </FormCard>

        <FormCard title="Problem statements">
          <Chips
            options={PS_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.psMode}
            onChange={(v) => set({ psMode: v })}
          />
          <p className="text-xs text-muted-foreground">
            {PS_MODE_OPTIONS.find((o) => o.value === draft.psMode)?.hint} A team&apos;s statement locks when it&apos;s chosen, and only locked teams
            can be judged. You can always assign or change one from the team&apos;s page.
          </p>
          {opening && overview.counts.active > 0 && (
            <p className="text-sm text-foreground">Saving tells every team still without a statement that they can choose now.</p>
          )}
          {teamsChoose && (
            <>
              <Toggle
                label="Deadline for teams"
                hint={draft.psDeadline ? "Teams still choosing get a reminder an hour before. After it, you assign the rest." : undefined}
                checked={!!draft.psDeadline}
                onChange={(on) => set({ psDeadline: on ? defaultDeadline() : "" })}
              />
              {draft.psDeadline && (
                <Field label="Choose by">
                  <Input
                    type="datetime-local"
                    value={toLocalInput(draft.psDeadline)}
                    onChange={(e) => set({ psDeadline: fromLocalInput(e.target.value) ?? "" })}
                  />
                </Field>
              )}
            </>
          )}
        </FormCard>

        <FormCard title="Themes">
          <Chips options={THEME_MODE_OPTIONS} value={draft.themeMode} onChange={(v) => set({ themeMode: v })} />
          {draft.themeMode === "LIST" && !overview.counts.themes && (
            <p className="text-xs text-muted-foreground">Add themes from the hackathon page; with none, teams skip it.</p>
          )}
        </FormCard>

        <div className="lg:col-span-2">
          <FormCard
            title="Venue"
            description={eventVenue ? `Leave the name and address blank to use the event's venue: ${eventVenue}.` : "Teams see this on their hackathon screen."}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Venue name">
                <Input value={draft.venueName} onChange={(e) => set({ venueName: e.target.value })} placeholder={ev.name ?? "Main campus"} />
              </Field>
              <Field label="Maps link (optional)">
                <Input type="url" value={draft.venueMapUrl} onChange={(e) => set({ venueMapUrl: e.target.value })} placeholder="https://maps.app.goo.gl/…" />
              </Field>
              <Field label="Address">
                <Textarea value={draft.venueAddress} onChange={(e) => set({ venueAddress: e.target.value })} placeholder={ev.address ?? ""} />
              </Field>
              <Field label="Directions for teams (optional)">
                <Textarea
                  value={draft.venueNotes}
                  onChange={(e) => set({ venueNotes: e.target.value })}
                  placeholder="Enter through Gate 3, registration desk in the lobby"
                />
              </Field>
            </div>
          </FormCard>
        </div>
      </div>
    </HackPage>
  );
}
