"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Money,
  Wallet,
  Bank,
  ChartLineUp,
  FlowArrow,
  CaretDown,
  ArrowRight,
} from "@unifesto/unicon/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import {
  getSpaceFinancials,
  getSpacePayouts,
  type Financials,
  type Payout,
} from "@/lib/api/payouts-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const money = (v: number | string) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

/** Compact ₹ for chart axes. */
const moneyShort = (v: number) => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${Math.round(v / 1e3)}k`;
  return `₹${v}`;
};

const C = {
  blue: "hsl(var(--primary))",
  green: "hsl(var(--success))",
  grid: "hsl(var(--border))",
  axis: "hsl(var(--muted-foreground))",
};

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { color?: string };
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && label !== "" && (
        <p className="mb-1 font-medium text-foreground">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.color ?? p.payload?.color }}
          />
          {p.name}:{" "}
          <span className="font-medium text-foreground">{money(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

/** Build the last `n` calendar-month buckets (oldest → newest). */
function lastMonths(n: number) {
  const out: { key: string; label: string; total: number }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({
      key: `${m.getFullYear()}-${m.getMonth()}`,
      label: m.toLocaleDateString("en-IN", { month: "short" }),
      total: 0,
    });
  }
  return out;
}

export function OverviewPanel({
  onRequestPayout,
}: {
  onRequestPayout?: () => void;
}) {
  const spaceId = useSpaceId();
  const [fin, setFin] = useState<Financials | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [fRes, pRes] = await Promise.all([
      getSpaceFinancials(spaceId),
      getSpacePayouts(spaceId),
    ]);
    if (fRes.error) setError(fRes.error.message);
    else setFin(fRes.data);
    if (pRes.data) setPayouts(pRes.data);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const trendData = useMemo(() => {
    const buckets = lastMonths(6);
    const index = new Map(buckets.map((b) => [b.key, b]));
    for (const p of payouts) {
      if (p.status !== "COMPLETED") continue;
      const iso = p.completedAt ?? p.scheduledAt ?? null;
      if (!iso) continue;
      const d = new Date(iso);
      const b = index.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (b) b.total += Number(p.netAmount || 0);
    }
    return buckets;
  }, [payouts]);

  const hasTrend = trendData.some((b) => b.total > 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error) return <ErrorNotice message={error} />;
  if (!fin) return null;

  return (
    <div className="space-y-6">
      {/* Money flow — the hero */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlowArrow className="h-4 w-4 text-primary" weight="duotone" />
            Money flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyFlow fin={fin} onRequestPayout={onRequestPayout} />
        </CardContent>
      </Card>

      {/* Payouts over time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ChartLineUp className="h-4 w-4 text-primary" weight="duotone" />
            Payouts over time
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasTrend ? (
            <EmptyState
              icon={ChartLineUp}
              title="No payouts yet"
              description="Completed payouts show here month by month, so you can see money actually reaching your account."
            />
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: C.axis, fontSize: 12 }}
                  />
                  <YAxis
                    tickFormatter={moneyShort}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: C.axis, fontSize: 12 }}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="total" name="Paid out" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Money flow — three node cards joined by ribbon connectors that pinch toward
 * the (shorter) middle node. Horizontal on desktop; stacked with chevrons on
 * mobile. Row height and middle-card height are fixed so the ribbon edge
 * coordinates are known constants.
 * ------------------------------------------------------------------------- */

const ROW_H = 224; // lg:h-56
const MID_H = 128; // lg:h-32
const MID_TOP = (ROW_H - MID_H) / 2; // 48
const MID_BOT = MID_TOP + MID_H; // 176

function MoneyFlow({
  fin,
  onRequestPayout,
}: {
  fin: Financials;
  onRequestPayout?: () => void;
}) {
  const collected = Math.max(0, fin.collectedOverall);

  if (collected <= 0) {
    return (
      <EmptyState
        icon={FlowArrow}
        title="No money in yet"
        description="Once your events start earning, you'll see exactly where every rupee goes — fees, refunds, and what lands in your account."
      />
    );
  }

  const net = Math.max(0, fin.netEntitlement);
  const netPct = collected > 0 ? Math.round((net / collected) * 100) : 0;
  const deductions = fin.processingFees + fin.platformFee + fin.refunded;

  return (
    <div className="flex flex-col items-stretch gap-3 lg:h-56 lg:flex-row lg:gap-0">
      {/* Node 1 — Collected */}
      <FlowNode className="lg:flex-1">
        <NodeHead icon={Money} label="Collected" />
        <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          {money(collected)}
        </p>
        <div className="mt-auto space-y-1.5 pt-4">
          <NodeRow label="Ticket revenue" value={money(fin.ticketRevenue)} />
          {deductions > 0 && (
            <NodeRow label="Fees & refunds" value={`− ${money(deductions)}`} muted />
          )}
        </div>
      </FlowNode>

      <Connector direction="in" />

      {/* Node 2 — Net entitlement (the waist) */}
      <FlowNode center className="lg:h-32 lg:w-64 lg:flex-none lg:self-center">
        <div className="flex h-full flex-col items-center justify-center text-center">
          <NodeHead icon={Wallet} label="Net entitlement" centered />
          <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {money(net)}
          </p>
          <p className="text-eyebrow mt-1">{netPct}% of collected kept</p>
        </div>
      </FlowNode>

      <Connector direction="out" />

      {/* Node 3 — Available */}
      <FlowNode className="lg:flex-1">
        <NodeHead icon={Bank} label="Available to request" />
        <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          {money(fin.available)}
        </p>
        <div className="mt-auto space-y-1.5 pt-4">
          <NodeRow label="Settled" value={money(fin.settled)} />
          <NodeRow label="Pending" value={money(fin.pending)} muted />
          {(fin.overdrawn ?? 0) > 0 && (
            <NodeRow label="Overdrawn (refunds after payout)" value={`−${money(fin.overdrawn ?? 0)}`} />
          )}
          {fin.available > 0 && onRequestPayout && (
            <button
              type="button"
              onClick={onRequestPayout}
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Request payout
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </FlowNode>
    </div>
  );
}

function FlowNode({
  children,
  className = "",
  center = false,
}: {
  children: ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <div
      className={`relative z-10 flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm ${
        center ? "" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

function NodeHead({
  icon: IconCmp,
  label,
  centered = false,
}: {
  icon: typeof Money;
  label: string;
  centered?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${centered ? "justify-center" : ""}`}>
      <IconCmp className="h-3.5 w-3.5 text-muted-foreground" weight="duotone" />
      <span className="text-eyebrow">{label}</span>
    </div>
  );
}

function NodeRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          muted
            ? "tabular-nums text-muted-foreground"
            : "font-medium tabular-nums text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The ribbon between two nodes. On desktop, a filled bezier band that pinches
 * from the tall side-node to the shorter middle node ("in") or widens back out
 * ("out"). On mobile it collapses to a centered chevron.
 */
const FLOW_LINES = 90; // number of streamlines filling each ribbon

function Connector({ direction }: { direction: "in" | "out" }) {
  const gradId = `flow-${direction}`;
  // Left ribbon flows in blue, right ribbon in green.
  const color = direction === "in" ? C.blue : C.green;
  // Brighter tint for the light coursing along the lines.
  const lightColor = direction === "in" ? "hsl(var(--primary))" : "hsl(var(--success))";

  // The band spans the full row height on the side-node edge and the (shorter)
  // middle-node height on the waist edge. Each streamline interpolates between
  // the two spans, so the whole ribbon reads as flowing lines that pinch in.
  const lines = Array.from({ length: FLOW_LINES + 1 }, (_, i) => {
    const t = i / FLOW_LINES;
    const yFull = t * ROW_H; // side-node edge
    const yWaist = MID_TOP + t * MID_H; // middle-node edge
    const [yL, yR] = direction === "in" ? [yFull, yWaist] : [yWaist, yFull];
    return { d: `M0,${yL} C50,${yL} 50,${yR} 100,${yR}`, edge: i === 0 || i === FLOW_LINES };
  });

  const fillPath =
    direction === "in"
      ? `M0,0 C50,0 50,${MID_TOP} 100,${MID_TOP} L100,${MID_BOT} C50,${MID_BOT} 50,${ROW_H} 0,${ROW_H} Z`
      : `M0,${MID_TOP} C50,${MID_TOP} 50,0 100,0 L100,${ROW_H} C50,${ROW_H} 50,${MID_BOT} 0,${MID_BOT} Z`;

  return (
    <>
      {/* Mobile: a simple downward chevron between stacked cards. */}
      <div className="flex justify-center py-0.5 text-muted-foreground lg:hidden">
        <CaretDown className="h-4 w-4" />
      </div>

      {/* Desktop: the flowing ribbon. Negative margins let it kiss both cards. */}
      <div className="relative -mx-3 hidden w-16 flex-none lg:block xl:w-24">
        <svg
          viewBox={`0 0 100 ${ROW_H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={0.04} />
              <stop offset="50%" stopColor={color} stopOpacity={0.1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          {/* Faint wash so the pinch reads even between lines. */}
          <path d={fillPath} fill={`url(#${gradId})`} />
          {/* Streamlines filling the whole band. non-scaling-stroke keeps them
              crisp despite the horizontal stretch. */}
          {lines.map((l, i) => (
            <path
              key={i}
              d={l.d}
              fill="none"
              stroke={color}
              strokeWidth={l.edge ? 1.5 : 1}
              strokeOpacity={l.edge ? 0.65 : 0.3}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* Light coursing along every other line — staggered delays make the
              lit segments form a moving diagonal front. */}
          {lines.map((l, i) =>
            i % 2 === 0 ? (
              <path
                key={`light-${i}`}
                className="flow-light"
                d={l.d}
                fill="none"
                stroke={lightColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ animationDelay: `${-(i / FLOW_LINES) * 4.5}s` }}
              />
            ) : null
          )}
        </svg>
      </div>
    </>
  );
}
