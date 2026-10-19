"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import {
  Broadcast,
  Buildings,
  Certificate,
  ChartBar,
  DoorOpen,
  DownloadSimple,
  Gavel,
  GearSix,
  Lifebuoy,
  Lightbulb,
  ListNumbers,
  MapPin,
  Megaphone,
  Power,
  Tag,
  Tray,
  Trophy,
  UsersThree,
} from "@unifesto/unicon/react";
import type { Icon } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { HackPage, Notice, StatsRow, hackBase, useResult } from "@/components/hackathon/HackParts";
import { EndOfEventChecklist } from "@/components/hackathon/EndOfEventChecklist";
import { disableHackathon, enableHackathon, getHackathonOverview, importTeams } from "@/lib/api/hackathon";
import { psModeSummary } from "@/lib/hackathon";

const WHAT_IT_DOES = [
  "Group registrations become teams, each with a Team ID in your format.",
  "Every team member gets the hackathon screens in the app: Team ID, venue, room and updates.",
  "Teams lock in a problem statement (written, picked from your list, or assigned by you) before judging.",
  "Teams pick a judge and wait in a live queue; judges call them, run a timed slot and give marks.",
  "Updates reach teams as a push and in the app.",
];

const icon = (I: Icon) => <I className="h-5 w-5" weight="fill" />;

/**
 * The curator's hackathon hub for one event (port of mobile
 * HackathonManageScreen): switch hackathon mode on or off, import teams, and
 * reach every hackathon section.
 */
export default function HackathonHubPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getHackathonOverview(eventId), [eventId]);
  const { data, setData, error, setError, reload } = useResult(fetcher);
  const [switching, setSwitching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFrom, setImportFrom] = useState("all");
  const [notice, setNotice] = useState("");
  const base = hackBase(eventId);

  const turnOn = async () => {
    setSwitching(true);
    const res = await enableHackathon(eventId);
    setSwitching(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
    if (!res.data.hackathon?.teamCodePrefix) setNotice("Hackathon mode is on. Next, set your Team ID format in settings, then import teams.");
  };

  const turnOff = async () => {
    if (
      !window.confirm(
        "Turn off hackathon mode? Teams and judges stop seeing the hackathon screens. Teams, Team IDs and rooms are kept, and turning it back on restores everything."
      )
    )
      return;
    setSwitching(true);
    const res = await disableHackathon(eventId);
    setSwitching(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
  };

  const runImport = async () => {
    if (!data?.hackathon?.teamCodePrefix) return setError("Set a Team ID prefix first. Teams get their IDs as they are imported.");
    if (
      !window.confirm(
        "Import teams? Confirmed group registrations become teams, in booking order. Running it again only adds new ones: Team IDs are never reassigned."
      )
    )
      return;
    setImporting(true);
    setError("");
    const res = await importTeams(eventId, importFrom === "all" ? undefined : [importFrom]);
    setImporting(false);
    if (!res.ok) return setError(res.message);
    const r = res.data;
    setNotice(
      [
        r.imported
          ? `${r.imported} new team${r.imported === 1 ? "" : "s"} imported. Each got a Team ID and a notification.`
          : "No new group registrations to import.",
        r.alreadyImported ? `${r.alreadyImported} already had a team.` : "",
        r.individualSkipped
          ? `${r.individualSkipped} individual registration${r.individualSkipped === 1 ? " was" : "s were"} left out (only group registrations become teams).`
          : "",
        `Next Team ID: ${r.nextTeamCode}.`,
      ]
        .filter(Boolean)
        .join(" ")
    );
    void reload();
  };

  const h = data?.hackathon;
  const on = !!h?.enabled;
  const blocked = !!data && (!data.planAllowed || (!!data.otherBoard && data.otherBoard.entrants > 0));
  const venueName = h?.venue.name || data?.eventVenue.name || data?.eventVenue.address;

  return (
    <HackPage eventId={eventId} back={null} title="Sprint" subtitle="Hackathon teams, problem statements, judging and winners." error={error} ready={!!data}>
      {data && (
        <>
          <Notice message={notice} />
          {!on ? (
            <Card className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                {h
                  ? "Teams and judges can't see the hackathon right now. Everything you set up is saved."
                  : "Turn on hackathon mode to manage teams, rooms and judging from here."}
              </p>
              {!h && (
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
                  {WHAT_IT_DOES.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {!data.planAllowed ? (
                <p className="text-sm text-warning">Hackathon mode isn&apos;t included in this space&apos;s plan. Ask a space admin to upgrade.</p>
              ) : data.otherBoard && data.otherBoard.entrants > 0 ? (
                <p className="text-sm text-warning">
                  This event already has a leaderboard with entrants, so it can&apos;t be switched to a hackathon.
                </p>
              ) : null}
              <Button size="lg" onClick={turnOn} disabled={switching || blocked}>
                {switching ? "Turning on…" : h ? "Turn back on" : "Turn on hackathon mode"}
              </Button>
            </Card>
          ) : (
            <>
              <StatsRow
                stats={[
                  { label: "Teams", value: data.counts.active },
                  { label: "PS locked", value: data.counts.psLocked },
                  { label: "No room", value: data.counts.unallocated },
                  { label: "Cancelled", value: data.counts.cancelled },
                ]}
              />

              <EndOfEventChecklist eventId={eventId} counts={data.counts} />

              {!h?.teamCodePrefix && (
                <ListGroup title="Start here">
                  <ListRow icon={icon(GearSix)} label="Set your Team ID format" value="Needed to import" href={`${base}/settings`} />
                </ListGroup>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <ListGroup title="Teams">
                  <ListRow
                    icon={icon(UsersThree)}
                    label="Teams"
                    value={data.counts.teams ? `${data.counts.active} active` : "None yet"}
                    href={`${base}/teams`}
                  />
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="text-foreground">{icon(DownloadSimple)}</span>
                    <span className="flex-1 text-sm text-foreground">
                      Import group registrations
                      {h?.nextTeamCode && <span className="ml-2 text-muted-foreground">Next {h.nextTeamCode}</span>}
                    </span>
                    {data.groupTicketTypes.length > 1 && (
                      <select
                        value={importFrom}
                        onChange={(e) => setImportFrom(e.target.value)}
                        className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                      >
                        <option value="all">All group tickets</option>
                        {data.groupTicketTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button size="sm" variant="outline" onClick={runImport} disabled={importing}>
                      {importing ? "Importing…" : "Import"}
                    </Button>
                  </div>
                </ListGroup>

                <ListGroup
                  title="Problem statements"
                  description={
                    data.counts.active
                      ? `${data.counts.psLocked} of ${data.counts.active} teams have locked in a problem statement. Only those teams can be judged.`
                      : undefined
                  }
                >
                  <ListRow
                    icon={icon(Lightbulb)}
                    label="Problem statements"
                    value={
                      data.counts.statements
                        ? `${data.counts.statements} · ${psModeSummary(h?.psMode ?? null, h?.psDeadline ?? null)}`
                        : psModeSummary(h?.psMode ?? null, h?.psDeadline ?? null)
                    }
                    href={`${base}/statements`}
                  />
                  <ListRow
                    icon={icon(Tag)}
                    label="Themes"
                    value={data.counts.themes ? String(data.counts.themes) : h?.themeMode === "TEXT" ? "Teams type it" : "Add themes"}
                    href={`${base}/themes`}
                  />
                </ListGroup>

                <ListGroup title="Judging">
                  <ListRow icon={icon(ListNumbers)} label="Rounds and criteria" href={`${base}/rounds`} />
                  <ListRow icon={icon(Gavel)} label="Judges, mentors and panels" href={`${base}/judges`} />
                  <ListRow icon={icon(Broadcast)} label="Live queues" href={`${base}/queues`} />
                </ListGroup>

                <ListGroup title="Results and winners">
                  <ListRow
                    icon={icon(ChartBar)}
                    label="Results"
                    value={h?.scoringMode === "CUMULATIVE" ? "Rounds added up" : "Final round decides"}
                    href={`${base}/results`}
                  />
                  <ListRow
                    icon={icon(Trophy)}
                    label="Winners"
                    value={
                      data.counts.awards
                        ? `${data.counts.awardsPublished} of ${data.counts.awards} published`
                        : data.canDeclareWinners
                          ? "Add awards"
                          : "None yet"
                    }
                    href={`${base}/winners`}
                  />
                  <ListRow icon={icon(Certificate)} label="Certificates" value="Participants and winners" href={`${base}/certificates`} />
                </ListGroup>

                <ListGroup title="Announcements and help desk">
                  <ListRow icon={icon(Megaphone)} label="Send an announcement" href={`${base}/announce`} />
                  <ListRow icon={icon(Lifebuoy)} label="Help topics and contacts" value="Food, Wi-Fi…" href={`${base}/help-topics`} />
                  <ListRow icon={icon(Tray)} label="Queries from teams" href={`${base}/help-desk`} />
                </ListGroup>

                <ListGroup title="Venue and rooms">
                  <ListRow
                    icon={icon(DoorOpen)}
                    label="Rooms"
                    value={data.counts.rooms ? `${data.counts.rooms} · ${data.counts.unallocated} teams without one` : "Add rooms"}
                    href={`${base}/rooms`}
                  />
                  <ListRow icon={icon(h?.venue.name ? Buildings : MapPin)} label="Venue" value={venueName || "Not set"} href={`${base}/settings`} />
                  <ListRow icon={icon(GearSix)} label="Hackathon settings" value={h?.nextTeamCode ?? undefined} href={`${base}/settings`} />
                </ListGroup>
              </div>

              <ListGroup>
                <ListRow
                  icon={<Power className="h-5 w-5 text-destructive" weight="fill" />}
                  label={switching ? "Turning off…" : "Turn off hackathon mode"}
                  destructive
                  disabled={switching}
                  onClick={turnOff}
                />
              </ListGroup>
            </>
          )}
        </>
      )}
    </HackPage>
  );
}
