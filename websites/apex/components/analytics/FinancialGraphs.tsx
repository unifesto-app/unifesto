"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipContentProps,
} from "recharts";
import { ChartLineUp } from "@phosphor-icons/react";
import {
  getFinancialTimeseries,
  type FinancialMonth,
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
 * Resolve a design token (e.g. "--primary" → "221 83% 53%") into a usable
 * `hsl(...)` string. Recharts writes colours as SVG attributes, which do NOT
 * resolve CSS `var()`, so we read the computed values from :root once on mount.
 * Apex is a light-only surface, so a single read is enough (no theme observer).
 */
function useTokenColors() {
  const [colors, setColors] = useState({
    primary: "hsl(221 83% 53%)",
    success: "hsl(142 71% 45%)",
    destructive: "hsl(358 75% 59%)",
    warning: "hsl(32 95% 44%)",
    grid: "hsl(240 6% 90%)",
    axis: "hsl(240 4% 46%)",
  });

  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    const read = (token: string, fallback: string) => {
      const raw = root.getPropertyValue(token).trim();
      return raw ? `hsl(${raw})` : fallback;
    };
    setColors({
      primary: read("--primary", "hsl(221 83% 53%)"),
      success: read("--success", "hsl(142 71% 45%)"),
      destructive: read("--destructive", "hsl(358 75% 59%)"),
      warning: read("--warning", "hsl(32 95% 44%)"),
      grid: read("--border", "hsl(240 6% 90%)"),
      axis: read("--muted-foreground", "hsl(240 4% 46%)"),
    });
  }, []);

  return colors;
}

/** ₹ with Indian magnitude suffixes (k / L / Cr) for compact axis ticks. */
function compactINR(v: number): string {
  const n = Math.abs(v);
  if (n >= 1e7) return `₹${(v / 1e7).toFixed(n % 1e7 === 0 ? 0 : 1)}Cr`;
  if (n >= 1e5) return `₹${(v / 1e5).toFixed(n % 1e5 === 0 ? 0 : 1)}L`;
  if (n >= 1e3) return `₹${(v / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}k`;
  return `₹${v}`;
}

const fullINR = (v: number) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

/** Shared tooltip styled as a raised card; formats every value as full ₹. */
function MoneyTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div
            key={String(entry.dataKey)}
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
              {fullINR(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinancialGraphs() {
  const [range, setRange] = useState<AnalyticsRange>("12m");
  const [data, setData] = useState<FinancialMonth[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const colors = useTokenColors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const { data, error } = await getFinancialTimeseries(range);
      if (cancelled) return;
      if (error) setError(error.message);
      else setData(data?.months ?? []);
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
  const hasData = data && data.some((m) => m.collected || m.refunded || m.settled);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Financial trends
          </h2>
          <p className="text-xs text-muted-foreground">
            Sales and their refunds dated to the sale period; payouts dated when
            settled.
          </p>
        </div>
        <RangeSwitcher value={range} onChange={setRange} />
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : !hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <ChartLineUp
              className="h-8 w-8 text-muted-foreground"
              weight="duotone"
            />
            <p className="text-sm font-medium text-foreground">
              No financial activity yet
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Once paid registrations, refunds, or payouts land, their monthly
              trends will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Revenue & refunds — the headline chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Revenue &amp; refunds</CardTitle>
              <CardDescription>
                Ticket revenue and refunds each month, with net revenue overlaid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
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
                  <YAxis tickFormatter={compactINR} width={56} {...axisProps} />
                  <Tooltip
                    content={MoneyTooltip}
                    cursor={{ fill: colors.grid, fillOpacity: 0.35 }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  />
                  <Bar
                    dataKey="ticketRevenue"
                    name="Ticket revenue"
                    fill={colors.success}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="refunded"
                    name="Refunded"
                    fill={colors.destructive}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Line
                    type="monotone"
                    dataKey="netRevenue"
                    name="Net revenue"
                    stroke={colors.primary}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Owed vs settled — payout lag */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Owed vs settled</CardTitle>
              <CardDescription>
                Net revenue earned each month against payouts settled.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={data!}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.primary} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillSettled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.success} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={colors.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={colors.grid}
                    vertical={false}
                  />
                  <XAxis {...xAxisProps} />
                  <YAxis tickFormatter={compactINR} width={56} {...axisProps} />
                  <Tooltip content={MoneyTooltip} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="netRevenue"
                    name="Net revenue"
                    stroke={colors.primary}
                    strokeWidth={2}
                    fill="url(#fillNet)"
                  />
                  <Area
                    type="monotone"
                    dataKey="settled"
                    name="Settled"
                    stroke={colors.success}
                    strokeWidth={2}
                    fill="url(#fillSettled)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Processing fees — platform earnings trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Processing fees</CardTitle>
              <CardDescription>
                The app fee the platform keeps, per month.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={data!}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillFees" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.warning} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={colors.warning} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={colors.grid}
                    vertical={false}
                  />
                  <XAxis {...xAxisProps} />
                  <YAxis tickFormatter={compactINR} width={56} {...axisProps} />
                  <Tooltip content={MoneyTooltip} />
                  <Area
                    type="monotone"
                    dataKey="processingFees"
                    name="Processing fees"
                    stroke={colors.warning}
                    strokeWidth={2}
                    fill="url(#fillFees)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
