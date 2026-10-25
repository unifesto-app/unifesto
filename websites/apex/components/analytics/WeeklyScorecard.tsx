"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Globe,
  CalendarBlank,
  Buildings,
  TrendUp,
  CurrencyInr,
  Lifebuoy,
} from "@unifesto/unicon/react";
import {
  getWeeklyScorecard,
  type WeeklyScorecard as Scorecard,
  type WoW,
  type WoWRow,
} from "@/lib/api/analytics-api";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { inr } from "@/lib/utils/money";
import { useTokenColors } from "./FinancialGraphs";

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString("en-IN");

/** "vs 120 last week (+25%)". */
function vs(w: WoW | undefined, show: (n: number) => string = fmt) {
  if (!w) return "";
  const pct =
    w.previous > 0
      ? ` (${w.current >= w.previous ? "+" : ""}${Math.round(((w.current - w.previous) / w.previous) * 100)}%)`
      : "";
  return `vs ${show(w.previous)} last week${pct}`;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

/** Z7: the Monday-review numbers, this week (last 7 IST days) vs the week before. */
export function WeeklyScorecard() {
  const [data, setData] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const colors = useTokenColors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await getWeeklyScorecard();
      if (cancelled) return;
      if (error) setError(error.message);
      else setData(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const s = data?.support;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Weekly scorecard
        </h2>
        <p className="text-sm text-muted-foreground">
          {data
            ? `${day(data.weeks.current.from)} to today vs ${day(
                data.weeks.previous.from
              )} to ${day(
                new Date(new Date(data.weeks.current.from).getTime() - 1).toISOString()
              )}`
            : "Last 7 days vs the 7 before"}
        </p>
      </div>

      {error && <ErrorNotice message={error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Web visits"
          value={fmt(data?.web.visits.current)}
          hint={`${vs(data?.web.visits)} · ${fmt(data?.web.pageViews.current)} page views`}
          icon={Globe}
          loading={loading}
        />
        <StatCard
          title="Upcoming published events"
          value={fmt(data?.upcomingEvents.current)}
          hint={vs(data?.upcomingEvents)}
          icon={CalendarBlank}
          loading={loading}
        />
        <StatCard
          title="Active organisers"
          value={fmt(data?.activeOrganisers.current)}
          hint={`Spaces that published in 30 days · ${vs(data?.activeOrganisers)}`}
          icon={Buildings}
          loading={loading}
        />
        <StatCard
          title="Registrations"
          value={fmt(data?.registrations.total.current)}
          hint={`Confirmed · ${vs(data?.registrations.total)}`}
          icon={TrendUp}
          loading={loading}
        />
        <StatCard
          title="GMV · platform fees"
          value={loading ? "—" : `${inr(data?.money.gmv.current)} · ${inr(data?.money.platformFees.current)}`}
          hint={`GMV ${vs(data?.money.gmv, inr)}; fees ${vs(data?.money.platformFees, inr)}`}
          icon={CurrencyInr}
          tone="success"
          loading={loading}
        />
        <StatCard
          title="Open support cases"
          value={fmt(s?.open)}
          hint={
            s
              ? `${fmt(s.pending)} waiting on requester · oldest open ${
                  s.oldestOpenDays == null ? "none" : `${s.oldestOpenDays}d`
                }`
              : ""
          }
          icon={Lifebuoy}
          loading={loading}
        />
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Top referrers</CardTitle>
              <CardDescription>
                Website page views by referring domain. Direct = typed, bookmarked or no referrer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.web.referrers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No website views yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, data.web.referrers.length * 36)}>
                  <BarChart
                    layout="vertical"
                    data={data.web.referrers.map((r) => ({ ...r, name: r.key ?? "Direct" }))}
                    margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: colors.axis }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 12, fill: colors.axis }}
                    />
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="current" name="This week" fill={colors.primary} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="previous" name="Last week" fill={colors.axis} fillOpacity={0.35} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <RowsCard
              title="Top UTM campaigns"
              description="Website views carrying utm_campaign."
              rows={data.web.campaigns}
              empty="No tagged visits."
            />
            <RowsCard
              title="Registrations by source"
              description="Confirmed registrations by utm_source."
              rows={data.registrations.bySource}
              empty="No registrations."
            />
          </div>
        </div>
      )}
    </section>
  );
}

function RowsCard({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: WoWRow[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-1 text-left font-medium">Name</th>
                <th className="pb-1 text-right font-medium">This wk</th>
                <th className="pb-1 text-right font-medium">Last wk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key ?? "_none"} className="border-t border-border">
                  <td className="truncate py-1.5 pr-2 text-foreground">{r.key ?? "Direct / untagged"}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{fmt(r.current)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmt(r.previous)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
