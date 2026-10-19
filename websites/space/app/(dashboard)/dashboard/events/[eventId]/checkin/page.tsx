"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle,
  QrCode,
  MagnifyingGlass,
  Users,
  Clock,
  XCircle,
  DeviceMobile,
  Plus,
  Trash,
  MapPin,
} from "@unifesto/unicon/react";
import {
  getCheckinStats,
  scanQRCode,
  getCheckinAccess,
  setCheckinAccess,
  getCheckinTypes,
  createCheckinType,
  deleteCheckinType,
  searchAttendees,
  manualCheckin,
  getOfflineRegistrations,
} from "@/lib/api/registrations-api";
import type {
  CheckinStats,
  CheckinAccessMember,
  CheckinType,
  AttendeeSearchResult,
  Registration,
} from "@/lib/api/registrations-api";
import { EventExportMenu } from "@/components/shared/EventExportMenu";
import { useSession } from "@/lib/context/SessionContext";
import { can } from "@/lib/types/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/StatCard";
import { cn } from "@/lib/utils/cn";

function initials(name?: string | null, username?: string | null): string {
  return (name || username || "?").substring(0, 2).toUpperCase();
}

export default function EventCheckinPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { currentRole } = useSession();

  const [types, setTypes] = useState<CheckinType[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<string>("");
  const [stats, setStats] = useState<CheckinStats | null>(null);
  // Bumped after each check-in so the Recent list refreshes immediately.
  const [recentKey, setRecentKey] = useState(0);

  const loadTypes = useCallback(async () => {
    const { data } = await getCheckinTypes(eventId);
    const t = data?.types ?? [];
    setTypes(t);
    setActiveTypeId((prev) => prev || t[0]?.id || "");
  }, [eventId]);

  const loadStats = useCallback(async () => {
    if (!activeTypeId) return;
    const { data } = await getCheckinStats(eventId, activeTypeId);
    if (data) setStats(data);
  }, [eventId, activeTypeId]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    void loadStats();
    const interval = setInterval(() => void loadStats(), 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const activeType = types.find((t) => t.id === activeTypeId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-in"
        subtitle={
          can(currentRole, "event:assign-curators")
            ? "Manage check-in points, grant your team access, and check attendees in"
            : "Scan or search to check attendees in"
        }
        actions={
          can(currentRole, "event:manage-attendees") ? (
            <EventExportMenu eventId={eventId} type="checkins" />
          ) : undefined
        }
      />

      {/* Point selector */}
      {types.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Point:</span>
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTypeId(t.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                t.id === activeTypeId
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats for the selected point */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Bookings" value={(stats?.total ?? 0).toString()} icon={Users} hint="Confirmed; a group counts once" />
        <StatCard
          title={`Bookings checked in${activeType ? ` · ${activeType.name}` : ""}`}
          value={(stats?.checkedIn ?? 0).toString()}
          icon={CheckCircle}
          tone="success"
          hint={
            stats && stats.total > 0
              ? `${parseFloat(String(stats.checkInRate)).toFixed(0)}% at this point`
              : undefined
          }
        />
        <StatCard title="Bookings not checked in" value={(stats?.remaining ?? 0).toString()} icon={Clock} />
        <StatCard title="Bookings cancelled" value={(stats?.cancelled ?? 0).toString()} icon={XCircle} />
      </div>

      {/* Setting up points and access is for organisers; Crew just check in. */}
      {can(currentRole, "event:assign-curators") && (
        <>
          <CheckinPointsCard eventId={eventId} types={types} onChanged={loadTypes} />
          <CheckinAccessCard eventId={eventId} />
        </>
      )}

      <ScanAndSearchCard
        eventId={eventId}
        activeTypeId={activeTypeId}
        activeTypeName={activeType?.name}
        onChecked={async () => {
          setRecentKey((k) => k + 1);
          await loadStats();
        }}
      />

      <RecentCheckinsCard eventId={eventId} reloadKey={recentKey} />
    </div>
  );
}

/** How long ago a timestamp was, compactly. */
function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** A live feed of the most recent attendees checked in for this event. */
function RecentCheckinsCard({
  eventId,
  reloadKey,
}: {
  eventId: string;
  reloadKey: number;
}) {
  const [items, setItems] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await getOfflineRegistrations(eventId);
    const recent = (data ?? [])
      .filter((r) => r.checkedInAt)
      .sort(
        (a, b) =>
          new Date(b.checkedInAt!).getTime() - new Date(a.checkedInAt!).getTime()
      )
      .slice(0, 10);
    setItems(recent);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle className="h-4 w-4" />
          Recent check-ins
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No check-ins yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((r) => {
              // Get the most recent check-in record
              const latestCheckin = r.checkinRecords && r.checkinRecords.length > 0
                ? r.checkinRecords.sort((a, b) => 
                    new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()
                  )[0]
                : null;
              
              const checkedByName = latestCheckin?.checkedInByUser?.fullName 
                || latestCheckin?.checkedInByUser?.username
                || r.checkedInByUser?.fullName
                || r.checkedInByUser?.username
                || null;
              
              const checkinTypeName = latestCheckin?.checkinType?.name || null;

              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {initials(r.user.fullName, r.user.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.user.fullName || r.user.username || "Attendee"}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {r.ticketType?.name && (
                          <span className="truncate">{r.ticketType.name}</span>
                        )}
                        {checkedByName && (
                          <>
                            {r.ticketType?.name && <span>•</span>}
                            <span className="truncate">by {checkedByName}</span>
                          </>
                        )}
                        {checkinTypeName && (
                          <>
                            {(r.ticketType?.name || checkedByName) && <span>•</span>}
                            <span className="truncate">{checkinTypeName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(r.checkedInAt!)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Organiser: manage the event's check-in points. */
function CheckinPointsCard({
  eventId,
  types,
  onChanged,
}: {
  eventId: string;
  types: CheckinType[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    const { error } = await createCheckinType(eventId, name.trim());
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    await onChanged();
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Delete the "${label}" point? Its check-in records are removed.`))
      return;
    const { error } = await deleteCheckinType(eventId, id);
    if (error) setErr(error.message);
    else await onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" weight="duotone" />
          Check-in points
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Add the points where you&apos;ll check people in (e.g. Entry, Lunch,
          Day 1, Session A). Attendees are checked in separately at each.
        </p>
        {err && <ErrorNotice message={err} />}
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm"
            >
              {t.name}
              <button
                onClick={() => remove(t.id, t.name)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${t.name}`}
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New point name…"
            className="max-w-xs"
          />
          <Button onClick={add} disabled={busy || !name.trim()}>
            <Plus className="h-4 w-4" weight="bold" />
            Add point
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Organiser: grant team members access to specific check-in points. */
function CheckinAccessCard({ eventId }: { eventId: string }) {
  const [types, setTypes] = useState<CheckinType[]>([]);
  const [members, setMembers] = useState<CheckinAccessMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getCheckinAccess(eventId);
    if (error) setError(error.message);
    else if (data) {
      setTypes(data.types);
      setMembers(data.members);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (
    m: CheckinAccessMember,
    next: string[] | "ALL"
  ) => {
    setBusyId(m.userId);
    setError("");
    const { error } = await setCheckinAccess(eventId, m.userId, next);
    setBusyId(null);
    if (error) {
      setError(error.message);
      return;
    }
    // Optimistic local update
    setMembers((prev) =>
      prev.map((x) =>
        x.userId === m.userId
          ? {
              ...x,
              allPoints: next === "ALL",
              grantedTypeIds: next === "ALL" ? [] : next,
            }
          : x
      )
    );
  };

  const toggleType = (m: CheckinAccessMember, typeId: string) => {
    const current = m.allPoints ? types.map((t) => t.id) : m.grantedTypeIds;
    const next = current.includes(typeId)
      ? current.filter((id) => id !== typeId)
      : [...current, typeId];
    save(m, next);
  };

  const toggleAll = (m: CheckinAccessMember) => {
    save(m, m.allPoints ? [] : "ALL");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DeviceMobile className="h-5 w-5" />
          Check-in access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Scanning happens in the mobile app. Tick which points each team member
          can check attendees in at. Add people on the{" "}
          <span className="font-medium text-foreground">Team</span> tab first.
          Organisers always have access to every point.
        </p>
        {error && <ErrorNotice message={error} />}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading team…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No team members yet. Add volunteers or staff on the Team tab.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {members.map((m) => (
              <li key={m.userId} className="space-y-2 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-medium">
                      {m.user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.user.avatarUrl}
                          alt=""
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        initials(m.user.fullName, m.user.username)
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {m.user.fullName || m.user.username || "Member"}
                      </p>
                      {m.role && (
                        <p className="text-xs text-muted-foreground">{m.role.name}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant={m.allPoints ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleAll(m)}
                    disabled={busyId === m.userId}
                  >
                    {m.allPoints ? "All points ✓" : "All points"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-10">
                  {types.map((t) => {
                    const on = m.allPoints || m.grantedTypeIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleType(m, t.id)}
                        disabled={busyId === m.userId || m.allPoints}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-60",
                          on
                            ? "border-success/30 bg-success-soft text-success"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** QR entry + manual attendee search, checking in at the selected point. */
function ScanAndSearchCard({
  eventId,
  activeTypeId,
  activeTypeName,
  onChecked,
}: {
  eventId: string;
  activeTypeId: string;
  activeTypeName?: string;
  onChecked: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"qr" | "manual">("qr");
  const [qrInput, setQrInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AttendeeSearchResult[]>([]);
  const seq = useRef(0);

  const flash = (ok: boolean, msg: string) => {
    setResult({ ok, msg });
    setTimeout(() => setResult(null), 4000);
  };

  const doScan = async (code?: string) => {
    const qr = (code ?? qrInput).trim();
    if (!qr || !activeTypeId) return;
    setBusy(true);
    const { data, error } = await scanQRCode(qr, activeTypeId);
    setBusy(false);
    setQrInput("");
    if (error) {
      flash(false, error.message);
    } else if (data) {
      const name =
        data.attendee?.fullName || data.attendee?.username || "Attendee";
      flash(
        true,
        data.alreadyCheckedIn ? `${name} already checked in here` : `Checked in: ${name}`
      );
      void onChecked();
    }
  };

  // Debounced manual search.
  useEffect(() => {
    if (mode !== "manual") return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const s = ++seq.current;
    const t = setTimeout(async () => {
      const { data } = await searchAttendees(eventId, q, activeTypeId);
      if (s !== seq.current) return;
      setResults(data?.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, mode, eventId, activeTypeId]);

  const checkInManual = async (r: AttendeeSearchResult) => {
    if (!activeTypeId) return;
    setBusy(true);
    const { data, error } = await manualCheckin(r.registrationId, activeTypeId);
    setBusy(false);
    if (error) {
      flash(false, error.message);
    } else if (data) {
      const name = r.attendee.fullName || r.attendee.username || "Attendee";
      flash(
        true,
        data.alreadyCheckedIn ? `${name} already checked in here` : `Checked in: ${name}`
      );
      // reflect locally
      setResults((prev) =>
        prev.map((x) =>
          x.registrationId === r.registrationId
            ? { ...x, checkedInAtPoint: new Date().toISOString() }
            : x
        )
      );
      void onChecked();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-5 w-5" />
          Check in{activeTypeName ? ` · ${activeTypeName}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-1 rounded-md border border-border p-1 w-fit">
          <button
            onClick={() => setMode("qr")}
            className={cn(
              "rounded px-3 py-1 text-sm font-medium",
              mode === "qr" ? "bg-primary-soft text-primary" : "text-muted-foreground"
            )}
          >
            QR / code
          </button>
          <button
            onClick={() => setMode("manual")}
            className={cn(
              "rounded px-3 py-1 text-sm font-medium",
              mode === "manual" ? "bg-primary-soft text-primary" : "text-muted-foreground"
            )}
          >
            Manual search
          </button>
        </div>

        {result && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              result.ok
                ? "border-success/30 bg-success-soft text-success"
                : "border-destructive/30 bg-destructive-soft text-destructive"
            )}
          >
            {result.msg}
          </div>
        )}

        {mode === "qr" ? (
          <div className="flex gap-2">
            <Input
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doScan()}
              placeholder="Paste/scan a QR value or ticket code…"
              disabled={busy || !activeTypeId}
              autoFocus
            />
            <Button onClick={() => doScan()} disabled={busy || !qrInput || !activeTypeId}>
              {busy ? "…" : "Check in"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, phone or ticket id…"
                className="pl-9"
              />
            </div>
            {results.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {results.map((r) => (
                  <li
                    key={r.registrationId}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.attendee.fullName || r.attendee.username || "Attendee"}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.ticketType}</p>
                    </div>
                    {r.checkedInAtPoint ? (
                      <Badge variant="success">
                        <CheckCircle className="mr-1 h-3 w-3" weight="fill" />
                        Checked in
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => checkInManual(r)}
                        disabled={busy || !activeTypeId}
                      >
                        Check in
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
