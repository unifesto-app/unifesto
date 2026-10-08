"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipContentProps,
} from "recharts";
import { Users, Buildings, CalendarBlank } from "@unifesto/unicon/react";
import {
  getGrowthTimeseries,
  type GrowthMonth,
  type StatusSlice,
  type AnalyticsRange,
} from "@/lib/api/analytics-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { RangeSwitcher } from "./RangeSwitcher";

/**
 * Resolve design tokens (e.g. "--primary" → "221 83% 53%") into `hsl(...)`
 * strings once on mount. Recharts writes colours as SVG attributes, which do
 * NOT resolve CSS `var()`. Apex is a light-only surface, so a single read is
 * enough. `violet`/`teal` have no token, so they are fixed brand-adjacent hues
 * that keep each entity a distinct, consistent colour across every chart.
 */
function useTokenColors() {
  const [colors, setColors] = useState({
    primary: "hsl(221 83% 53%)",
    success: "hsl(142 71% 45%)",
    destructive: "hsl(358 75% 59%)",
    warning: "hsl(32 95% 44%)",
    violet: "hsl(262 83% 58%)",
    teal: "hsl(173 70% 39%)",
    grid: "hsl(240 6% 90%)",
    axis: "hsl(240 4% 46%)",
  });

  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    const read = (token: string, fallback: string) => {
      const raw = root.getPropertyValue(token).trim();
      return raw ? `hsl(${raw})` : fallback;
    };
    setColors((c) => ({
      ...c,
      primary: read("--primary", c.primary),
      success: read("--success", c.success),
      destructive: read("--destructive", c.destructive),
      warning: read("--warning", c.warning),
      grid: read("--border", c.grid),
      axis: read("--muted-foreground", c.axis),
    }));
  }, []);

  return colors;
}

/** Compact integer axis ticks with Indian magnitude suffixes (k / L / Cr). */
function compactInt(v: number): string {
  const n = Math.abs(v);
  if (n >= 1e7) return `${(v / 1e7).toFixed(n % 1e7 === 0 ? 0 : 1)}Cr`;
  if (n >= 1e5) return `${(v / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1)}L`;
  if (n >= 1e3) return `${(v / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}k`;
  return `${v}`;
}

const fullInt = (v: number) => Number(v || 0).toLocaleString("en-IN");

/** Shared tooltip styled as a raised card; formats every value as an integer. */
function CountTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div
            key={String(entry.dataKey ?? entry.name)}
            className="flex items-center justify-between gap-4 text-xs"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {fullInt(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GrowthGraphs() {
  const [range, setRange] = useState<AnalyticsRange>("12m");
  const [data, setData] = useState<GrowthMonth[] | null>(null);
  const [eventsByStatus, setEventsByStatus] = useState<StatusSlice[]>([]);
  const [spacesByStatus, setSpacesByStatus] = useState<StatusSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const colors = useTokenColors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const { data, error } = await getGrowthTimeseries(range);
      if (cancelled) return;
      if (error) setError(error.message);
      else {
        setData(data?.months ?? []);
        setEventsByStatus(data?.eventsByStatus ?? []);
        setSpacesByStatus(data?.spacesByStatus ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const axisProps = {
    stroke: colors.axis,
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  };
  // Finer ranges (hourly/daily) crowd the x-axis; thin ticks and always keep
  // the first and last so the window's endpoints stay labelled.
  const xAxisProps = {
    dataKey: "label",
    interval: "preserveStartEnd" as const,
    minTickGap: 16,
    ...axisProps,
  };

  const hasData =
    data && data.some((m) => m.newUsers || m.newSpaces || m.newEvents);

  // Categorical palette for the status donuts (stable order → stable colours).
  const donutPalette = useMemo(
    () => [
      colors.primary,
      colors.success,
      colors.warning,
      colors.violet,
      colors.teal,
      colors.destructive,
      colors.axis,
    ],
    [colors]
  );

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="h-5 w-40">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Growth trends
          </h2>
          <p className="text-xs text-muted-foreground">
            New sign-ups, spaces, and events per period, with running totals and
            current status mix.
          </p>
        </div>
        <RangeSwitcher value={range} onChange={setRange} />
      </div>

      {error && <ErrorNotice message={error} />}

      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground" weight="duotone" />
            <p className="text-sm font-medium text-foreground">
              No growth to show yet
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Once users sign up and spaces or events are created, their monthly
              trends will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ---------------------------- Users ---------------------------- */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" weight="duotone" />
                <CardTitle className="text-base">User growth</CardTitle>
              </div>
              <CardDescription>
                New accounts each period (bars) against the running platform
                total (line).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={data!}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={colors.grid}
                    vertical={false}
                  />
                  <XAxis {...xAxisProps} />
                  <YAxis
                    yAxisId="new"
                    tickFormatter={compactInt}
                    width={44}
                    {...axisProps}
                  />
                  <YAxis
                    yAxisId="total"
                    orientation="right"
                    tickFormatter={compactInt}
                    width={44}
                    {...axisProps}
                  />
                  <Tooltip
                    content={CountTooltip}
                    cursor={{ fill: colors.grid, fillOpacity: 0.35 }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  />
                  <Bar
                    yAxisId="new"
                    dataKey="newUsers"
                    name="New sign-ups"
                    fill={colors.primary}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Line
                    yAxisId="total"
                    type="monotone"
                    dataKey="cumulativeUsers"
                    name="Total users"
                    stroke={colors.violet}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ---------------------------- Spaces --------------------------- */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Buildings className="h-4 w-4 text-primary" weight="duotone" />
                <CardTitle className="text-base">Space growth</CardTitle>
              </div>
              <CardDescription>
                New spaces per period and the running total.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={data!}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={colors.grid}
                    vertical={false}
                  />
                  <XAxis {...xAxisProps} />
                  <YAxis
                    yAxisId="new"
                    tickFormatter={compactInt}
                    width={40}
                    {...axisProps}
                  />
                  <YAxis
                    yAxisId="total"
                    orientation="right"
                    tickFormatter={compactInt}
                    width={40}
                    {...axisProps}
                  />
                  <Tooltip
                    content={CountTooltip}
                    cursor={{ fill: colors.grid, fillOpacity: 0.35 }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  />
                  <Bar
                    yAxisId="new"
                    dataKey="newSpaces"
                    name="New spaces"
                    fill={colors.violet}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                  <Line
                    yAxisId="total"
                    type="monotone"
                    dataKey="cumulativeSpaces"
                    name="Total spaces"
                    stroke={colors.primary}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Space status mix */}
          <StatusDonut
            title="Spaces by status"
            description="Current distribution across the space lifecycle."
            slices={spacesByStatus}
            palette={donutPalette}
            axisColor={colors.axis}
          />

          {/* ---------------------------- Events --------------------------- */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarBlank
                  className="h-4 w-4 text-primary"
                  weight="duotone"
                />
                <CardTitle className="text-base">Event growth</CardTitle>
              </div>
              <CardDescription>
                Events created each period, how many went live, and the running
                total.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={data!}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={colors.grid}
                    vertical={false}
                  />
                  <XAxis {...xAxisProps} />
                  <YAxis
                    yAxisId="new"
                    tickFormatter={compactInt}
                    width={44}
                    {...axisProps}
                  />
                  <YAxis
                    yAxisId="total"
                    orientation="right"
                    tickFormatter={compactInt}
                    width={44}
                    {...axisProps}
                  />
                  <Tooltip
                    content={CountTooltip}
                    cursor={{ fill: colors.grid, fillOpacity: 0.35 }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  />
                  <Bar
                    yAxisId="new"
                    dataKey="newEvents"
                    name="Created"
                    fill={colors.teal}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    yAxisId="new"
                    dataKey="publishedEvents"
                    name="Published"
                    fill={colors.success}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                  <Line
                    yAxisId="total"
                    type="monotone"
                    dataKey="cumulativeEvents"
                    name="Total events"
                    stroke={colors.primary}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Registrations trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrations</CardTitle>
              <CardDescription>
                Event sign-ups placed each period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={data!}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillRegs" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={colors.warning}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="100%"
                        stopColor={colors.warning}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={colors.grid}
                    vertical={false}
                  />
                  <XAxis {...xAxisProps} />
                  <YAxis tickFormatter={compactInt} width={44} {...axisProps} />
                  <Tooltip content={CountTooltip} />
                  <Area
                    type="monotone"
                    dataKey="newRegistrations"
                    name="Registrations"
                    stroke={colors.warning}
                    strokeWidth={2}
                    fill="url(#fillRegs)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Event status mix */}
          <StatusDonut
            title="Events by status"
            description="Current distribution across the event lifecycle."
            slices={eventsByStatus}
            palette={donutPalette}
            axisColor={colors.axis}
          />
        </div>
      )}
    </section>
  );
}

/** A donut of a status distribution with a compact legend + centre total. */
function StatusDonut({
  title,
  description,
  slices,
  palette,
  axisColor,
}: {
  title: string;
  description: string;
  slices: StatusSlice[];
  palette: string[];
  axisColor: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const sorted = [...slices].sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex h-[236px] items-center justify-center text-xs text-muted-foreground">
            Nothing to show yet.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={200} className="sm:!w-1/2">
              <PieChart>
                <Pie
                  data={sorted}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                >
                  {sorted.map((s, i) => (
                    <Cell key={s.status} fill={palette[i % palette.length]} />
                  ))}
                </Pie>
                <Tooltip content={CountTooltip} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="w-full space-y-1.5 sm:w-1/2">
              {sorted.map((s, i) => (
                <li
                  key={s.status}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: palette[i % palette.length] }}
                    />
                    {prettyStatus(s.status)}
                  </span>
                  <span className="tabular-nums font-medium text-foreground">
                    {fullInt(s.count)}
                    <span
                      className="ml-1 text-muted-foreground"
                      style={{ color: axisColor }}
                    >
                      ({Math.round((s.count / total) * 100)}%)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** "PARTIALLY_REFUNDED" → "Partially refunded". */
function prettyStatus(s: string): string {
  const lower = s.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
