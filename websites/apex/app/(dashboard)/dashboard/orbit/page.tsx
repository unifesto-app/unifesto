"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Buildings, Stack, Users, Wallet } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/utils/money";
import {
  appointOrbitApplication,
  appointOrbitLead,
  declineOrbitApplication,
  endOrbitLead,
  getOrbitApplications,
  getOrbitLeaderboard,
  setOrbitExamPause,
  type OrbitApplication,
  type OrbitCampus,
  type OrbitLeadRow,
} from "@/lib/api/platform-tools-api";

const TIER_TONE = { Probation: "neutral", Lead: "brand", Bronze: "warning", Silver: "neutral", Gold: "success" } as const;
const CLOCK_TONE = { active: "success", paused: "neutral", "check-in": "warning", reopen: "destructive" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * Apex › Orbit: the Unifesto Orbit leaderboard. One row per campus (a top-level
 * Super space) with its clubs rolled up, ranked by tier then active clubs.
 * Appointing a Lead also makes them Space Admin of the campus; ending one
 * removes that access.
 */
export default function OrbitPage() {
  const [rows, setRows] = useState<OrbitCampus[] | null>(null);
  const [error, setError] = useState("");
  const [campusId, setCampusId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void getOrbitLeaderboard().then(({ data, error }) => {
      if (error) return setError(error.message);
      setRows(data?.campuses ?? []);
    });
  }, []);
  useEffect(load, [load]);

  const run = async (call: Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError("");
    const { error } = await call;
    setBusy(false);
    if (error) return setError(error.message);
    load();
  };

  const appoint = async () => {
    if (!campusId || !email.trim()) return setError("Pick a campus and enter the student's account email.");
    await run(appointOrbitLead(campusId, email.trim()));
    setEmail("");
  };

  const end = (lead: OrbitLeadRow, campus: string) => {
    const reason = window.prompt(`End ${lead.user.fullName ?? "this Lead"} at ${campus}? Their admin access to the campus is removed. Reason:`);
    if (reason === null) return;
    void run(endOrbitLead(lead.id, reason));
  };

  const pause = (lead: OrbitLeadRow) => {
    const until = window.prompt("Exam window ends on (YYYY-MM-DD). Leave empty to clear the pause.", lead.examPauseUntil?.slice(0, 10) ?? "");
    if (until === null) return;
    if (until && Number.isNaN(Date.parse(until))) return setError("Use a date like 2026-12-20.");
    void run(setOrbitExamPause(lead.id, until ? new Date(`${until}T23:59:59+05:30`).toISOString() : null));
  };

  const led = rows?.filter((r) => r.leads.length > 0).length ?? 0;
  const needsCheckIn = rows?.filter((r) => r.clock && r.clock.status !== "active" && r.clock.status !== "paused").length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Growth"
        title="Unifesto Orbit"
        subtitle="Campuses ranked by tier, then active clubs. A club is active once it has published an event."
      />
      {error && <ErrorNotice message={error} />}

      {!rows && !error ? (
        <Skeleton className="h-64 w-full" />
      ) : rows ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Buildings} title="Campuses with a Lead" value={`${led} / ${rows.length}`} />
            <StatCard icon={Stack} title="Active clubs" value={rows.reduce((n, r) => n + r.activeClubs, 0)} />
            <StatCard icon={Users} title="Need a check-in" value={needsCheckIn} hint="60+ days inactive" />
            <StatCard icon={Wallet} title="Campus GMV" value={inr(rows.reduce((n, r) => n + r.gmv, 0))} />
          </div>

          <ApplicationsPanel campuses={rows} onChanged={load} />

          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Campus</span>
                <select
                  className="h-9 min-w-56 rounded-md border bg-background px-2"
                  value={campusId}
                  onChange={(e) => setCampusId(e.target.value)}
                >
                  <option value="">Choose a campus</option>
                  {rows.map((r) => (
                    <option key={r.spaceId} value={r.spaceId}>
                      {r.name}{r.leads.length ? " (has a Lead)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid flex-1 gap-1 text-sm">
                <span className="text-muted-foreground">Student&apos;s Unifesto account email</span>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@college.edu" />
              </label>
              <Button onClick={appoint} disabled={busy}>Appoint Orbit Lead</Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Campus</th>
                    <th className="px-4 py-3 font-medium">Tier</th>
                    <th className="px-4 py-3 font-medium">Orbit Lead</th>
                    <th className="px-4 py-3 text-right font-medium">Clubs (active)</th>
                    <th className="px-4 py-3 text-right font-medium">Events</th>
                    <th className="px-4 py-3 text-right font-medium">Paid regs</th>
                    <th className="px-4 py-3 text-right font-medium">GMV</th>
                    <th className="px-4 py-3 font-medium">Clock</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.spaceId} className="border-b align-top last:border-0">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/spaces/${r.spaceId}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        {r.verified && <Badge variant="success" className="ml-2">Verified</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={TIER_TONE[r.tierName]}>{r.tierName}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {r.leads.length ? (
                          r.leads.map((l) => (
                            <div key={l.id} className="mb-1">
                              <div title={l.user.email ?? undefined}>{l.user.fullName || l.user.username || l.user.email}</div>
                              <div className="text-xs text-muted-foreground">
                                Since {day(l.joinedAt)}
                                {r.tier === 0 && ` · probation ends ${day(l.probationEndsAt)}`}
                                {l.examPauseUntil && ` · exams till ${day(l.examPauseUntil)}`}
                              </div>
                              <div className="mt-1 flex gap-2 text-xs">
                                <button className="text-primary hover:underline" disabled={busy} onClick={() => pause(l)}>Exam pause</button>
                                <button className="text-destructive hover:underline" disabled={busy} onClick={() => end(l, r.name)}>End</button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <Badge variant="warning">Open</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.clubs} ({r.activeClubs})</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.publishedEvents}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.paidRegistrations}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{inr(r.gmv)}</td>
                      <td className="px-4 py-3">
                        {r.clock ? (
                          <Badge variant={CLOCK_TONE[r.clock.status]}>
                            {r.clock.status === "paused" ? "Paused" : `${r.clock.inactiveDays}d quiet`}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                        No campuses yet. A campus is a top-level Super space.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

/**
 * Applications from unifesto.app/orbit/apply. Open ones first, each with the
 * campus to appoint them to (their pick by default; a college that isn't on
 * Unifesto yet needs its campus Space created first).
 */
function ApplicationsPanel({ campuses, onChanged }: { campuses: OrbitCampus[]; onChanged: () => void }) {
  const [apps, setApps] = useState<OrbitApplication[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    void getOrbitApplications().then(({ data, error }) => {
      if (error) return setError(error.message);
      setApps(data ?? []);
    });
  }, []);
  useEffect(load, [load]);

  const act = async (id: string, call: Promise<{ error: { message: string } | null }>) => {
    setBusy(id);
    setError("");
    const { error } = await call;
    setBusy("");
    if (error) return setError(error.message);
    load();
    onChanged();
  };

  if (!apps) return null;
  const open = apps.filter((a) => a.status === "PENDING");
  const decided = apps.filter((a) => a.status !== "PENDING");

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-medium">Applications</h2>
          <span className="text-sm text-muted-foreground">{open.length} open</span>
        </div>
        {error && <ErrorNotice message={error} />}
        {open.length === 0 && (
          <p className="text-sm text-muted-foreground">No open applications. They arrive from unifesto.app/orbit/apply.</p>
        )}
        {open.map((a) => {
          const spaceId = pick[a.id] ?? a.space?.id ?? "";
          const email = a.user.identities[0]?.email;
          return (
            <div key={a.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">{a.user.fullName || email || "Applicant"}</span>
                  <span className="text-sm text-muted-foreground">
                    {" "}· {a.collegeName} · {a.yearOfStudy}
                    {!a.space && " · college not on Unifesto yet"}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {email} · {a.user.mobileNumber} · {day(a.createdAt)}
                </span>
              </div>
              <dl className="grid gap-3 text-sm md:grid-cols-3">
                {(
                  [
                    ["Their clubs", a.myClubs],
                    ["Clubs on campus", a.campusClubs],
                    ["Why", a.why],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="whitespace-pre-line break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Campus to appoint them to"
                  className="h-9 min-w-56 rounded-md border bg-background px-2 text-sm"
                  value={spaceId}
                  onChange={(e) => setPick({ ...pick, [a.id]: e.target.value })}
                >
                  <option value="">Choose a campus</option>
                  {campuses.map((c) => (
                    <option key={c.spaceId} value={c.spaceId}>
                      {c.name}{c.leads.length ? " (has a Lead)" : ""}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!spaceId || busy === a.id}
                  onClick={() => void act(a.id, appointOrbitApplication(a.id, spaceId))}
                >
                  Appoint Orbit Lead
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === a.id}
                  onClick={() => {
                    const note = window.prompt("Decline this application? Optional note for the record:");
                    if (note !== null) void act(a.id, declineOrbitApplication(a.id, note));
                  }}
                >
                  Decline
                </Button>
              </div>
            </div>
          );
        })}
        {decided.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Decided ({decided.length})</summary>
            <ul className="mt-2 space-y-1">
              {decided.map((a) => (
                <li key={a.id}>
                  <Badge variant={a.status === "APPOINTED" ? "success" : "neutral"}>{a.status === "APPOINTED" ? "Appointed" : "Declined"}</Badge>{" "}
                  {a.user.fullName || a.user.identities[0]?.email} · {a.space?.name ?? a.collegeName}
                  {a.reviewedAt && ` · ${day(a.reviewedAt)}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
