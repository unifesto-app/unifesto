"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Buildings,
  CalendarBlank,
  TrendUp,
  CurrencyInr,
  PaperPlaneTilt,
  ArrowRight,
} from "@phosphor-icons/react";
import {
  getAnalyticsOverview,
  type AnalyticsOverview,
} from "@/lib/api/analytics-api";
import { StatCard } from "@/components/shared/StatCard";
import { FinancialGraphs } from "@/components/analytics/FinancialGraphs";
import { GrowthGraphs } from "@/components/analytics/GrowthGraphs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString("en-IN");

/**
 * Mission-control overview for platform staff — the single `/dashboard` home.
 * This is the merged Dashboard + Analytics surface: at-a-glance stat cards on
 * top, then the financial and growth graphs that used to live on their own
 * Analytics page.
 */
export function AdminOverview() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await getAnalyticsOverview();
      if (cancelled) return;
      if (error) setError(error.message);
      else setData(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = data?.spaces.pendingRequests ?? 0;
  const publishRate =
    data && data.events.total > 0
      ? Math.round((data.events.published / data.events.total) * 100)
      : 0;
  const activeRate =
    data && data.spaces.total > 0
      ? Math.round((data.spaces.active / data.spaces.total) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Platform overview
          </h1>
          <p className="text-sm text-muted-foreground">
            The health of Unifesto at a glance
            {data?.generatedAt &&
              ` · updated ${new Date(data.generatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
          </p>
        </div>
        {!loading && pending > 0 && (
          <Link
            href="/dashboard/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-border-strong hover:bg-muted"
          >
            <Badge variant="warning">{pending}</Badge>
            space requests waiting
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
      </header>

      {error && (
        <Card className="border-destructive/30 bg-destructive-soft">
          <CardContent className="py-4">
            <p className="text-sm text-[hsl(358_65%_44%)]">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Users"
          value={fmt(data?.users.total)}
          hint={`+${fmt(data?.users.newLast30Days)} in last 30 days`}
          icon={Users}
          loading={loading}
        />
        <StatCard
          title="Spaces"
          value={fmt(data?.spaces.total)}
          hint={`${fmt(data?.spaces.active)} active · ${fmt(pending)} pending`}
          icon={Buildings}
          loading={loading}
        />
        <StatCard
          title="Events"
          value={fmt(data?.events.total)}
          hint={`${fmt(data?.events.published)} published`}
          icon={CalendarBlank}
          loading={loading}
        />
        <StatCard
          title="Registrations"
          value={fmt(data?.registrations.total)}
          hint="All event sign-ups"
          icon={TrendUp}
          loading={loading}
        />
        <StatCard
          title="Revenue"
          value={loading ? "—" : `₹${fmt(data?.revenue.totalPaid)}`}
          hint="Paid registrations"
          icon={CurrencyInr}
          tone="success"
          loading={loading}
        />
        <StatCard
          title="Push delivery"
          value={
            loading || data?.push?.deliveryRatePercent == null
              ? "—"
              : `${data.push.deliveryRatePercent}%`
          }
          hint={`${fmt(data?.push?.sentLast30Days)} sent · ${fmt(
            data?.push?.failedLast30Days
          )} failed (30d)`}
          icon={PaperPlaneTilt}
          loading={loading}
        />
      </div>

      <GrowthGraphs />

      <FinancialGraphs />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event health</CardTitle>
            <CardDescription>
              How much of what&apos;s created makes it live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RatioBar
              label="Published"
              value={publishRate}
              caption={`${fmt(data?.events.published)} of ${fmt(
                data?.events.total
              )} events`}
              loading={loading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Space health</CardTitle>
            <CardDescription>Active organisations vs. total.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RatioBar
              label="Active"
              value={activeRate}
              caption={`${fmt(data?.spaces.active)} of ${fmt(
                data?.spaces.total
              )} spaces`}
              loading={loading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** A labelled progress bar for a simple ratio (0–100%). */
function RatioBar({
  label,
  value,
  caption,
  loading,
}: {
  label: string;
  value: number;
  caption: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm font-semibold text-foreground">{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500 ease-standard"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
