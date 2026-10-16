"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TreeStructure,
  Users,
  CalendarBlank,
  Ticket,
  Coins,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  getSubSpaceAnalytics,
  type SubSpaceAnalytics,
  type SubSpaceAnalyticsRow,
} from "@/lib/api/spaces-api";
import type { SpaceWithHierarchy } from "@/lib/types/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const money = (v: number) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

/**
 * Sub-space analytics — the parent-space rollup view.
 *
 * Shows a SUPER space's organisers the aggregated activity of every space
 * beneath it (direct sub-spaces, sub-sub-spaces, and deeper): total members,
 * events and registrations, plus a per-sub-space breakdown.
 * Backed by `GET /spaces/:id/analytics`.
 */
export default function SubSpacesPage() {
  const router = useRouter();
  const spaceId = useSpaceId();
  const { spaces, loading: sessionLoading } = useSession();

  const [currentSpace, setCurrentSpace] = useState<SpaceWithHierarchy | null>(
    null
  );
  const [analytics, setAnalytics] = useState<SubSpaceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Resolve the space from the session; only SUPER spaces have this view.
  useEffect(() => {
    if (sessionLoading) return;
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) {
      router.push("/dashboard");
      return;
    }
    if (space.spaceKind && space.spaceKind !== "SUPER") {
      router.push(`/dashboard`);
      return;
    }
    setCurrentSpace(space);
  }, [spaceId, spaces, sessionLoading, router]);

  // Load the rolled-up analytics for the subtree.
  useEffect(() => {
    if (!currentSpace) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const { data, error } = await getSubSpaceAnalytics(currentSpace.id);
      if (cancelled) return;
      if (error) setError(error.message);
      else setAnalytics(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSpace]);

  const busy = sessionLoading || loading || !currentSpace;

  // Build the sub-space tree: a children-by-parent map plus the top-level roots
  // (whose parent is the current space, i.e. not itself in the subtree). The
  // view renders this recursively as an org-chart.
  const tree = useMemo(() => {
    const list = analytics?.subSpaces ?? [];
    const byParent = new Map<string | null, SubSpaceAnalyticsRow[]>();
    for (const r of list) {
      const key = r.parentSpaceId;
      const arr = byParent.get(key);
      if (arr) arr.push(r);
      else byParent.set(key, [r]);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    const idSet = new Set(list.map((r) => r.id));
    const roots = list
      .filter((r) => !r.parentSpaceId || !idSet.has(r.parentSpaceId))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { byParent, roots };
  }, [analytics]);

  if (busy) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const totals = analytics?.totals;
  const rows = analytics?.subSpaces ?? [];
  const hasSubSpaces = rows.length > 0;
  // Normalise the member bars to the largest sub-space in view.
  const maxMembers = Math.max(1, ...rows.map((r) => r.members));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Structure"
        title="Sub-spaces"
        subtitle={
          currentSpace
            ? `Rolled-up activity across everything beneath ${currentSpace.name}`
            : undefined
        }
      />

      {error && <ErrorNotice message={error} />}

      {!error && !hasSubSpaces && (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={TreeStructure}
              title="No sub-spaces yet"
              description="When spaces join this one as sub-spaces, their members, events and activity will roll up here — including sub-spaces of sub-spaces."
            />
          </CardContent>
        </Card>
      )}

      {!error && hasSubSpaces && totals && (
        <>
          {/* Rollup totals across the whole subtree */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <StatCard
              title="Net revenue"
              value={money(totals.revenue)}
              hint="After fees, across all sub-spaces"
              icon={Coins}
              tone="success"
            />
            <StatCard
              title="Sub-spaces"
              value={totals.subSpaces}
              hint={
                totals.maxDepth > 1
                  ? `${totals.maxDepth} levels deep`
                  : "Direct sub-spaces"
              }
              icon={TreeStructure}
              tone="brand"
            />
            <StatCard
              title="Members"
              value={totals.members}
              hint="Across all sub-spaces"
              icon={Users}
            />
            <StatCard
              title="Events"
              value={totals.events}
              hint={`${totals.upcomingEvents} upcoming`}
              icon={CalendarBlank}
            />
            <StatCard
              title="Registrations"
              value={totals.registrations}
              hint="Total sign-ups"
              icon={Ticket}
            />
          </div>

          {/* Hierarchy — the structure made visual. Parent at the root, every
              sub-space branching beneath it. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hierarchy</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Root: the parent space itself. */}
              <RootNode
                name={currentSpace?.name ?? "This space"}
                members={totals.members}
                events={totals.events}
                registrations={totals.registrations}
                revenue={totals.revenue}
              />
              <div className="ml-4 space-y-3 border-l-2 border-border pl-5 pt-3">
                {tree.roots.map((r) => (
                  <TreeNode
                    key={r.id}
                    node={r}
                    childrenMap={tree.byParent}
                    maxMembers={maxMembers}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** A small icon + number, the visual replacement for a labelled table cell. */
function MetricChip({
  icon: IconCmp,
  value,
  tone = "muted",
  title,
  money: asMoney = false,
}: {
  icon: typeof Users;
  value: number;
  tone?: "muted" | "success";
  title: string;
  money?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm tabular-nums ${
        tone === "success" ? "text-success" : "text-muted-foreground"
      }`}
      title={title}
    >
      <IconCmp className="h-4 w-4" weight="duotone" />
      <span className="font-medium text-foreground">
        {asMoney ? money(value) : value.toLocaleString("en-IN")}
      </span>
    </span>
  );
}

/** The parent space at the top of the tree — a filled, brand-tinted root node. */
function RootNode({
  name,
  members,
  events,
  registrations,
  revenue,
}: {
  name: string;
  members: number;
  events: number;
  registrations: number;
  revenue: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-primary/30 bg-primary-soft/50 p-4">
      <TreeStructure className="h-6 w-6 flex-shrink-0 text-primary" weight="fill" />
      <div className="min-w-0 flex-1">
        <p className="text-eyebrow">Parent space</p>
        <p className="truncate font-semibold text-foreground">{name}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <MetricChip icon={Coins} value={revenue} title="Net revenue" money tone="success" />
        <MetricChip icon={Users} value={members} title="Members" />
        <MetricChip icon={CalendarBlank} value={events} title="Events" />
        <MetricChip icon={Ticket} value={registrations} title="Registrations" />
      </div>
    </div>
  );
}

/** One node of the hierarchy, rendered recursively with a connector rail. */
function TreeNode({
  node,
  childrenMap,
  maxMembers,
}: {
  node: SubSpaceAnalyticsRow;
  childrenMap: Map<string | null, SubSpaceAnalyticsRow[]>;
  maxMembers: number;
}) {
  const kids = childrenMap.get(node.id) ?? [];
  const memberPct = Math.max(
    node.members > 0 ? 8 : 0,
    Math.round((node.members / maxMembers) * 100)
  );

  return (
    <div className="relative">
      {/* Elbow from the parent rail into this node. */}
      <span
        aria-hidden
        className="absolute -left-5 top-6 h-0.5 w-5 bg-border"
      />
      <div className="card-interactive rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <TreeStructure className="h-5 w-5 flex-shrink-0 text-primary" weight="duotone" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-foreground">{node.name}</span>
              {node.type === "SUPER" && <Badge variant="outline">Super</Badge>}
            </div>
            {/* Member-share bar — size of this community at a glance. */}
            <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${memberPct}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <MetricChip
              icon={Coins}
              value={node.revenue}
              title="Net revenue"
              money
              tone="success"
            />
            <MetricChip icon={Users} value={node.members} title="Members" />
            <MetricChip icon={CalendarBlank} value={node.events} title="Events" />
            {node.upcomingEvents > 0 && (
              <MetricChip
                icon={CalendarBlank}
                value={node.upcomingEvents}
                tone="success"
                title="Upcoming events"
              />
            )}
            <MetricChip icon={Ticket} value={node.registrations} title="Registrations" />
          </div>
        </div>
      </div>

      {kids.length > 0 && (
        <div className="ml-4 mt-3 space-y-3 border-l-2 border-border pl-5">
          {kids.map((k) => (
            <TreeNode
              key={k.id}
              node={k}
              childrenMap={childrenMap}
              maxMembers={maxMembers}
            />
          ))}
        </div>
      )}
    </div>
  );
}
