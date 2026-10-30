"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import {
  getOtaAdoption,
  getOtaGroups,
  getOtaStaleness,
  republishOtaGroup,
  revertOtaRollout,
  setOtaRollout,
  type OtaAdoption,
  type OtaChannel,
  type OtaGroup,
  type OtaStaleness,
} from "@/lib/api/platform-tools-api";

/*
 * Apex › OTA updates (web port of the mobile screen): what's published on each
 * EAS Update channel, with the rollout controls from mobile/docs/OTA.md
 * (raise, promote, revert, roll back). Publishing stays in the CLI. On top:
 * the stale-OTA alarm and what active phones actually run.
 */

const CHANNELS: { key: OtaChannel; label: string }[] = [
  { key: "production", label: "Production" },
  { key: "preview", label: "Preview" },
];

type State = "rollout" | "live" | "embedded" | "past";

/**
 * Newest first, per runtime: a staged rollout sits on top of the live update;
 * the first finished update is what everyone on that runtime runs; older ones
 * are past (and can be republished to roll back).
 */
function labelGroups(groups: OtaGroup[]): Map<string, State> {
  const out = new Map<string, State>();
  const settled = new Set<string>();
  for (const g of groups) {
    if (settled.has(g.runtimeVersion)) out.set(g.group, "past");
    else if (g.rolloutPercentage != null) out.set(g.group, "rollout");
    else {
      out.set(g.group, g.isRollBackToEmbedded ? "embedded" : "live");
      settled.add(g.runtimeVersion);
    }
  }
  return out;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const platformLabel = (p: string[]) => p.map((x) => (x === "ios" ? "iOS" : x === "android" ? "Android" : x)).join(" · ");

const BADGE: Record<State, { label: (g: OtaGroup) => string; variant: "warning" | "success" | "destructive" | "neutral" }> = {
  rollout: { label: (g) => `Rolling out · ${g.rolloutPercentage}%`, variant: "warning" },
  live: { label: () => "Live", variant: "success" },
  embedded: { label: () => "Rolled back to store build", variant: "destructive" },
  past: { label: () => "Past", variant: "neutral" },
};

export default function OtaPage() {
  const [channel, setChannel] = useState<OtaChannel>("production");
  const [groups, setGroups] = useState<OtaGroup[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [stale, setStale] = useState<OtaStaleness | null>(null);
  const [adoption, setAdoption] = useState<OtaAdoption | null>(null);

  const load = useCallback(
    (ch: OtaChannel) =>
      getOtaGroups(ch).then(({ data, error }) => {
        setGroups(data?.groups ?? null);
        setError(error?.message ?? "");
      }),
    []
  );

  useEffect(() => {
    let live = true;
    void getOtaGroups(channel).then(({ data, error }) => {
      if (!live) return;
      setGroups(data?.groups ?? null);
      setError(error?.message ?? "");
    });
    return () => {
      live = false;
    };
  }, [channel]);

  // Channel-independent; a failure just hides the card.
  useEffect(() => {
    void Promise.all([getOtaStaleness(), getOtaAdoption()]).then(([st, ad]) => {
      setStale(st.data);
      setAdoption(ad.data);
    });
  }, []);

  /** Confirm, run, reload. Every action changes what real phones download. */
  const act = async (g: OtaGroup, confirmText: string, run: () => ReturnType<typeof setOtaRollout>) => {
    if (!window.confirm(confirmText)) return;
    setBusy(g.group);
    const { error } = await run();
    setBusy(null);
    if (error) setError(error.message);
    await load(channel);
  };

  const states = groups ? labelGroups(groups) : new Map<string, State>();

  return (
    <div className="space-y-4">
      <PageHeader title="OTA updates" subtitle="What's published on each update channel, and the rollout controls." />

      {stale && <StaleCard s={stale} />}
      {adoption && <AdoptionCard a={adoption} groups={channel === "production" ? groups : null} />}

      <div className="inline-flex rounded-lg border border-border p-1" role="tablist">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            role="tab"
            aria-selected={channel === c.key}
            onClick={() => {
              setGroups(null);
              setChannel(c.key);
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              channel === c.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <ErrorNotice message={error} />}

      {!groups ? (
        !error && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        )
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing published on {channel} yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const s = states.get(g.group) ?? "past";
            const b = BADGE[s];
            const at = g.rolloutPercentage ?? 0;
            return (
              <Card key={g.group}>
                <CardContent className="space-y-2 p-4">
                  <Badge variant={b.variant}>{b.label(g)}</Badge>
                  <p className="text-sm font-medium text-foreground">
                    {g.isRollBackToEmbedded ? "Roll back to the store build's code" : g.message || "No message"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {when(g.createdAt)}
                    {g.publishedBy ? ` · ${g.publishedBy}` : ""} · {platformLabel(g.platforms)}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    Runtime {g.runtimeVersion.slice(0, 7)} · group {g.group.slice(0, 8)}
                    {g.gitCommitHash ? ` · ${g.gitCommitHash.slice(0, 7)}` : ""}
                  </p>
                  {s === "rollout" && (
                    <>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-warning" style={{ width: `${at}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {at < 50 && (
                          <Button size="sm" variant="outline" disabled={!!busy}
                            onClick={() => act(g, "Raise to 50%? Half of the phones on this runtime will get it.", () => setOtaRollout(g.group, 50))}>
                            50%
                          </Button>
                        )}
                        <Button size="sm" disabled={!!busy}
                          onClick={() => act(g, "Promote to everyone? Check Crashlytics (filter by update_id) first. Every phone on this runtime will get it.", () => setOtaRollout(g.group, 100))}>
                          {busy === g.group ? "Working…" : "Promote to 100%"}
                        </Button>
                        <Button size="sm" variant="destructive" disabled={!!busy}
                          onClick={() => act(g, "Revert this rollout? It's deleted and the update before it is republished, so phones that got it go back. Takes up to a minute.", () => revertOtaRollout(g.group))}>
                          Revert
                        </Button>
                      </div>
                    </>
                  )}
                  {s === "past" && !g.isRollBackToEmbedded && (
                    <div className="pt-1">
                      <Button size="sm" variant="outline" disabled={!!busy}
                        onClick={() => act(g, `Roll back to this update? It's republished as the newest update on ${channel}, and every phone on runtime ${g.runtimeVersion.slice(0, 7)} moves to it.`, () => republishOtaGroup(g.group))}>
                        {busy === g.group ? "Working…" : "Roll back to this"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Publish new updates with <code>npm run update:production</code> (starts at 20%). Rolling back to the store build is
        CLI-only: <code>npm run update:rollback</code>.
      </p>
    </div>
  );
}

/** The stale-OTA alarm: mobile commits on main nobody has received yet. */
function StaleCard({ s }: { s: OtaStaleness }) {
  const n = s.unshippedCommits;
  const count = n == null ? null : `${n}${s.unshippedTruncated ? "+" : ""}`;
  // A day-granularity age: the time the card mounted is close enough.
  const [now] = useState(Date.now);
  const old = s.oldestUnshippedAt ? Math.max(0, Math.floor((now - Date.parse(s.oldestUnshippedAt)) / 86_400_000)) : 0;
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap gap-2">
          {count != null && (
            <Badge variant={!n ? "success" : old >= 7 ? "destructive" : "warning"}>{n ? `${count} unshipped` : "Up to date"}</Badge>
          )}
          {s.main && (
            <Badge variant={s.main.otaSafe ? "success" : "destructive"}>
              {s.main.otaSafe ? "Main is OTA-safe" : "Main needs a store build"}
            </Badge>
          )}
        </div>
        {!s.main ? (
          <p className="text-sm text-muted-foreground">No report from CI yet. It posts after the next push to main that touches mobile/.</p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              {n == null
                ? "Couldn't compare main with the last publish."
                : n === 0
                  ? "Every mobile commit on main is published."
                  : `${count} mobile commit${n === 1 ? "" : "s"} on main newer than the last production update${old ? `, oldest ${old} day${old === 1 ? "" : "s"} ago` : ""}.`}
            </p>
            <p className="text-xs text-muted-foreground">
              {s.lastPublish ? `Last publish ${when(s.lastPublish.createdAt)}` : s.expoError || "Nothing published yet"} · main{" "}
              {s.main.sha.slice(0, 7)} checked {when(s.main.reportedAt)}
            </p>
            {!s.main.otaSafe && (
              <p className="text-sm text-destructive">
                Main&apos;s native fingerprint matches no live store build, so an OTA from main would reach nobody. Ship a store build.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Share of active users on each runtime, and on each update within it. */
function AdoptionCard({ a, groups }: { a: OtaAdoption; groups: OtaGroup[] | null }) {
  const label = (id: string | null) => {
    if (!id) return "Store build code";
    const g = groups?.find((x) => x.updateIds.includes(id));
    return g ? `${g.message || "Update"} · ${g.group.slice(0, 8)}` : `Update ${id.slice(0, 8)}`;
  };
  const row = (key: string, text: string, users: number, indent = false) => (
    <div key={key} className={cn("space-y-1", indent && "pl-4")}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={indent ? "text-muted-foreground" : "font-medium text-foreground"}>{text}</span>
        <span className="tabular-nums text-muted-foreground">
          {users} · {pct(users, a.total)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-1.5 rounded-full", indent ? "bg-primary/50" : "bg-primary")} style={{ width: `${pct(users, a.total)}%` }} />
      </div>
    </div>
  );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">What phones run</CardTitle>
        <p className="text-xs text-muted-foreground">
          {a.total} active user{a.total === 1 ? "" : "s"} (app reported in the last {a.days} days)
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        {a.byRuntime.map((r) => (
          <div key={r.runtimeVersion ?? "none"} className="space-y-2">
            {row(r.runtimeVersion ?? "none", r.runtimeVersion ? `Runtime ${r.runtimeVersion.slice(0, 7)}` : "Older app (doesn't report)", r.users)}
            {a.byUpdate
              .filter((u) => u.runtimeVersion === r.runtimeVersion)
              .map((u) => row(`${r.runtimeVersion}:${u.updateId}`, label(u.updateId), u.users, true))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
