"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Money,
  TrendUp,
  Receipt,
  ArrowCounterClockwise,
  Wallet,
  CheckCircle,
  Clock,
  Coins,
  Bank,
  Buildings,
  CaretRight,
  CaretUp,
  Download,
  CaretDown,
  CalendarBlank,
} from "@unifesto/unicon/react";
import {
  getPlatformFinancials,
  getPlatformFinancialsBreakdown,
  type PlatformFinancials,
  type PlatformFinancialsBreakdown,
  type SpaceFinancials,
  type EventFinancials,
} from "@/lib/api/payouts-api";
import { downloadCsv } from "@/lib/utils/csv";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { inr } from "@/lib/utils/money";

const money = inr;

const eventDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * The numeric money columns shared by the space table and the nested event
 * table. One config drives the header labels, the cell values, and which
 * columns are sortable — so a header can never drift from the number under it.
 */
type FigureKey = keyof Pick<
  SpaceFinancials,
  | "collectedOverall"
  | "ticketRevenue"
  | "refunded"
  | "platformFee"
  | "netEntitlement"
  | "settled"
  | "pending"
  | "available"
  | "overdrawn"
>;

const COLUMNS: { key: FigureKey; label: string; hint: string }[] = [
  { key: "collectedOverall", label: "Collected", hint: "Everything ever paid, incl. app fee" },
  { key: "refunded", label: "Refunded", hint: "Cash returned by approved refunds" },
  { key: "platformFee", label: "Platform fee", hint: "Revenue-share cut" },
  { key: "netEntitlement", label: "Net owed", hint: "Owed to organisers after fees" },
  { key: "settled", label: "Settled", hint: "Already paid out" },
  { key: "pending", label: "Pending", hint: "Queued for transfer" },
  { key: "available", label: "Remaining", hint: "Owed but not yet queued" },
  { key: "overdrawn", label: "Overdrawn", hint: "Paid out beyond net owed (refunds after payout); to recover" },
];

// Default ranking before anyone clicks a header: largest net owed first
// (decided in version-5 A3).
const DEFAULT_SORT_KEY: FigureKey = "netEntitlement";

export default function PlatformFinancialsPage() {
  const [totals, setTotals] = useState<PlatformFinancials | null>(null);
  const [spaces, setSpaces] = useState<SpaceFinancials[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<FigureKey>(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    // Prefer the richer breakdown; fall back to the flat totals endpoint so the
    // at-a-glance cards still render if the breakdown ever fails.
    const { data: breakdown, error: bErr } =
      await getPlatformFinancialsBreakdown();
    if (breakdown) {
      setTotals(breakdown.totals);
      setSpaces(breakdown.spaces);
    } else {
      const { data, error } = await getPlatformFinancials();
      if (error) setError(error.message);
      else setTotals(data);
      if (bErr && !error) setError(bErr.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (spaceId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });

  const onSort = (key: FigureKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedSpaces = useMemo(() => {
    if (!spaces) return [];
    const dir = sortDir === "desc" ? -1 : 1;
    return [...spaces].sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
  }, [spaces, sortKey, sortDir]);

  /** One row per event, with the same figures as the table (INR). */
  const exportCsv = () =>
    downloadCsv(
      `financials-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Space", "Event", "Event Date", ...COLUMNS.map((c) => `${c.label} (INR)`)],
      sortedSpaces.flatMap((s) =>
        s.events.map((e) => [s.name, e.title, e.startDateTime, ...COLUMNS.map((c) => e[c.key].toFixed(2))])
      )
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Financials"
        subtitle="Platform-wide money movement across every space — collected, refunded, settled, and still owed to organisers."
        actions={
          <Button variant="outline" disabled={!spaces?.length} onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : totals ? (
        <>
          {/* Money in */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Money in</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Collected (overall)"
                value={money(totals.collectedOverall)}
                hint="Tickets, extra seats and stays ever paid, incl. buyer fees and later refunds. Wider than Overview's Gross sales (paid tickets only)"
                icon={Money}
                tone="success"
              />
              <StatCard
                title="Sales excl. buyer fees"
                value={money(totals.ticketRevenue)}
                hint="Collected minus the processing fee buyers pay on top"
                icon={TrendUp}
                tone="success"
              />
              <StatCard
                title="Processing fees"
                value={money(totals.processingFees)}
                hint="App fee kept by the platform"
                icon={Receipt}
                tone="neutral"
              />
              <StatCard
                title="Platform earnings"
                value={money(totals.platformEarnings)}
                hint="App fees + revenue-share cut"
                icon={Buildings}
                tone="brand"
              />
            </div>
          </section>

          {/* Deductions & entitlement */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Deductions &amp; net owed
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Refunded"
                value={money(totals.refunded)}
                hint="Cash returned by approved refunds"
                icon={ArrowCounterClockwise}
                tone="neutral"
              />
              <StatCard
                title="Platform fee"
                value={money(totals.platformFee)}
                hint="Revenue-share cut across spaces"
                icon={Coins}
                tone="neutral"
              />
              <StatCard
                title="Net owed to organisers"
                value={money(totals.netEntitlement)}
                hint="Total entitlement after fees"
                icon={Wallet}
                tone="brand"
              />
            </div>
          </section>

          {/* Payouts */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Payouts</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Settled"
                value={money(totals.settled)}
                hint="Already transferred to organisers"
                icon={CheckCircle}
                tone="success"
              />
              <StatCard
                title="Pending"
                value={money(totals.pending)}
                hint="Queued — awaiting transfer"
                icon={Clock}
                tone="neutral"
              />
              <StatCard
                title="Remaining to pay out"
                value={money(totals.available)}
                hint="Owed but not yet requested/queued"
                icon={Bank}
                tone="brand"
              />
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Net owed reconciles as{" "}
            <span className="font-medium">Settled + Pending + Remaining</span>. Figures
            are cumulative and survive refunds.
          </p>

          {/* Detailed breakdown by space → event */}
          {spaces && (
            <Card>
              <CardHeader>
                <CardTitle>Breakdown by space</CardTitle>
                <CardDescription>
                  Expand a space to see its events. Click a column to re-sort.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {spaces.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No spaces have collected money yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Space</th>
                          {COLUMNS.map((col) => (
                            <th
                              key={col.key}
                              title={col.hint}
                              onClick={() => onSort(col.key)}
                              className="cursor-pointer select-none pb-2 pl-4 text-right font-medium hover:text-foreground"
                            >
                              <span className="inline-flex items-center gap-1">
                                {col.label}
                                {sortKey === col.key &&
                                  (sortDir === "desc" ? (
                                    <CaretDown className="h-3 w-3" weight="bold" />
                                  ) : (
                                    <CaretUp className="h-3 w-3" weight="bold" />
                                  ))}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSpaces.map((space) => (
                          <SpaceRows
                            key={space.spaceId}
                            space={space}
                            open={expanded.has(space.spaceId)}
                            onToggle={() => toggle(space.spaceId)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

/** A space header row plus (when open) one row per event beneath it. */
function SpaceRows({
  space,
  open,
  onToggle,
}: {
  space: SpaceFinancials;
  open: boolean;
  onToggle: () => void;
}) {
  const feeLabel =
    space.feePercent > 0 ? `${space.feePercent}% rev-share` : "No rev-share";

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50",
          open && "bg-muted/40"
        )}
      >
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            <CaretRight
              className={cn(
                "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90"
              )}
              weight="bold"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground">
                  {space.name}
                </span>
                <Badge variant={space.feePercent > 0 ? "brand" : "neutral"}>
                  {feeLabel}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                @{space.slug} · {space.eventCount}{" "}
                {space.eventCount === 1 ? "event" : "events"}
              </div>
            </div>
          </div>
        </td>
        {COLUMNS.map((col) => (
          <FigureCell key={col.key} value={space[col.key]} column={col.key} bold />
        ))}
      </tr>

      {open &&
        (space.events.length === 0 ? (
          <tr className="border-b border-border/60 bg-muted/20">
            <td
              colSpan={COLUMNS.length + 1}
              className="py-3 pl-10 text-xs text-muted-foreground"
            >
              No events in this space yet.
            </td>
          </tr>
        ) : (
          space.events.map((ev) => <EventRow key={ev.eventId} event={ev} />)
        ))}
    </>
  );
}

/** One event row shown beneath an expanded space. */
function EventRow({ event }: { event: EventFinancials }) {
  return (
    <tr className="border-b border-border/40 bg-muted/20 last:border-0 hover:bg-muted/40">
      <td className="py-2.5 pl-10 pr-4">
        <div className="min-w-0">
          <span className="truncate font-medium text-foreground">
            {event.title}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarBlank className="h-3 w-3" />
            {event.kind === "session" ? "Huddle session · " : ""}
            {eventDate(event.startDateTime)}
          </div>
        </div>
      </td>
      {COLUMNS.map((col) => (
        <FigureCell key={col.key} value={event[col.key]} column={col.key} />
      ))}
    </tr>
  );
}

/** A right-aligned money cell; zero is muted, "remaining" owed is tinted. */
function FigureCell({
  value,
  column,
  bold,
}: {
  value: number;
  column: FigureKey;
  bold?: boolean;
}) {
  const isZero = !value;
  return (
    <td
      className={cn(
        "py-3 pl-4 text-right tabular-nums",
        bold ? "font-medium" : "font-normal",
        isZero
          ? "text-muted-foreground/60"
          : column === "available" && value > 0
            ? "text-primary"
            : column === "overdrawn" && value > 0
              ? "text-destructive"
              : "text-foreground"
      )}
    >
      {money(value)}
    </td>
  );
}
