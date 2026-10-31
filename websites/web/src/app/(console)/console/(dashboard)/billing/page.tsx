"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Check, Minus, Lock } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import {
  getSpaceSubscription,
  getSpaceUsage,
  getPlanCatalog,
  PLAN_LABEL,
  PLAN_ORDER,
  type Subscription,
  type SubscriptionUsage,
  type PlanInfo,
  type PlanCatalog,
  type CatalogRow,
  type OrgPlan,
} from "@/console/lib/api/subscriptions-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";
import { cn } from "@/console/lib/utils/cn";
import { PLANS, inr, planMinimum } from "@/lib/site";

/** "4.5%", or "Custom" for Enterprise (by contract). */
function feeText(plan: PlanInfo): string {
  return plan.plan === "ENTERPRISE" ? "Custom" : `${plan.platformFeePercent}%`;
}

/** The least fee per event on Growth and Pro (Z2), in rupees, from the site's plan list. */
const minPerEvent = (plan: PlanInfo) => PLANS.find((p) => p.id === plan.plan.toLowerCase())?.minPerEvent;

/** "At least ₹999 an event", or null. */
const minimumText = (plan: PlanInfo) => planMinimum({ minPerEvent: minPerEvent(plan) });

function feeLabel(plan: PlanInfo): string {
  if (plan.plan === "ENTERPRISE") return "Fee by contract";
  return `${feeText(plan)} fee per paid ticket`;
}

/** Human label for a plan limit; `null`/undefined means unlimited. */
function limitLabel(n: number | null | undefined): string {
  return n === null || n === undefined ? "Unlimited" : n.toLocaleString("en-IN");
}

/** Plans are priced by their fee, not bought here (Z2): a platform admin moves a space. */
const moveUpHref = (plan: OrgPlan) => `mailto:support@unifesto.app?subject=${encodeURIComponent(`Move my Space to ${PLAN_LABEL[plan]}`)}`;

export default function BillingPage() {
  const spaceId = useSpaceId();
  const { currentSpace, can } = useSession();
  const allowed = can("space:manage-billing");

  const [sub, setSub] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const [cat, setCat] = useState<PlanCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    setError("");
    const [subRes, usageRes, catRes] = await Promise.all([
      getSpaceSubscription(spaceId),
      getSpaceUsage(spaceId),
      getPlanCatalog(),
    ]);
    if (subRes.error) setError(subRes.error.message);
    else setSub(subRes.data);
    if (usageRes.data) setUsage(usageRes.data);
    if (catRes.data) setCat(catRes.data);
    else if (catRes.error) setError(catRes.error.message);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="Plan & billing" />
        <EmptyState
          icon={Lock}
          title="Billing is for Space Admins"
          description="Only a Space Admin can view this space's plan."
        />
      </div>
    );
  }

  const plans = [...(cat?.plans ?? [])].sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan));
  const currentPlan: OrgPlan = sub?.plan ?? "STARTER";
  const current = plans.find((p) => p.plan === currentPlan) ?? plans[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plan & billing"
        subtitle={currentSpace ? `Billing for ${currentSpace.name}` : "Your space's plan"}
      />

      {error && <ErrorNotice message={error} />}

      {/* Current plan ------------------------------------------------------ */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Your plan</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-40" />
            ) : (
              <>
                <h2 className="mt-1 text-2xl font-semibold text-foreground">{PLAN_LABEL[currentPlan]}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  No monthly fee
                  {current && ` · ${feeLabel(current)}`}
                  {current && minimumText(current) && ` · ${minimumText(current)}`}
                </p>
              </>
            )}
          </div>

          {/* Usage against the plan's limits */}
          <div className="grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <Meter
              label="Events this month"
              used={usage?.eventsThisMonth}
              limit={usage?.limits.eventsPerMonth}
              loading={loading}
            />
            <Meter label="Attendees per event" limit={usage?.limits.attendeesPerEvent} loading={loading} />
            <Meter label="Ticket types per event" limit={usage?.limits.ticketTypes} loading={loading} />
            <Meter label="Co-curators per event" limit={usage?.limits.coCurators} loading={loading} />
          </div>
          {!loading && sub?.status === "EXPIRED" && (
            <p className="text-sm text-muted-foreground">
              Your {PLAN_LABEL[currentPlan]} plan ended, so General&apos;s limits apply. Your data is kept.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plans ------------------------------------------------------------- */}
      <section className="space-y-4" aria-labelledby="plans-heading">
        <div>
          <h2 id="plans-heading" className="text-lg font-semibold text-foreground">
            Plans
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No plan has a monthly price. Each one is priced by its fee on paid tickets. To move your Space, write to us
            and we switch it for you.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {plans.map((plan, i) => {
              const isCurrent = plan.plan === currentPlan;
              const prev = plans[i - 1];
              const adds = prev ? newFeatures(cat?.catalog ?? [], plan, prev) : [];
              const minimum = minimumText(plan);

              return (
                <Card
                  key={plan.plan}
                  className={cn("flex flex-col", isCurrent && "border-t-2 border-foreground")}
                >
                  <CardContent className="flex flex-1 flex-col gap-4 p-5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-foreground">{PLAN_LABEL[plan.plan]}</h3>
                        {isCurrent && (
                          <span className="text-xs font-medium text-foreground">
                            Current
                          </span>
                        )}
                      </div>
                      {plan.tagline && <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>}
                    </div>

                    <div>
                      <span className="text-2xl font-semibold tabular-nums text-foreground">{feeText(plan)}</span>
                      {plan.plan !== "ENTERPRISE" && <span className="text-sm text-muted-foreground"> per paid ticket</span>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {plan.plan === "ENTERPRISE" ? "Quoted per institution" : (minimum ?? "No monthly fee")}
                      </p>
                    </div>

                    <ul className="flex-1 space-y-1.5 text-sm">
                      <Line>{limitLabel(plan.eventsPerMonth)} events a month</Line>
                      <Line>{limitLabel(plan.attendeesPerEvent)} attendees per event</Line>
                      {prev && adds.length > 0 && (
                        <li className="pt-1 text-xs text-muted-foreground">Everything in {PLAN_LABEL[prev.plan]}, plus</li>
                      )}
                      {adds.map((label) => (
                        <Line key={label}>{label}</Line>
                      ))}
                      {!prev && <Line>Tickets, check-in, email and polls</Line>}
                    </ul>

                    {isCurrent ? (
                      <Button variant="outline" disabled className="w-full">
                        Current plan
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" asChild>
                        <a href={moveUpHref(plan.plan)}>Talk to us</a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Full comparison -------------------------------------------------- */}
      {cat && cat.catalog.length > 0 && (
        <section className="space-y-4" aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="text-lg font-semibold text-foreground">
            Compare every feature
          </h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-72 border-b border-border bg-card px-4 py-3 text-left font-normal text-muted-foreground">
                      <span className="sr-only">Feature</span>
                    </th>
                    {plans.map((p) => (
                      <th
                        key={p.plan}
                        scope="col"
                        className={cn(
                          "border-b border-border px-3 py-3 text-left font-semibold text-foreground",
                          p.plan === currentPlan && "bg-primary-soft"
                        )}
                      >
                        {PLAN_LABEL[p.plan]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Platform fee per paid ticket" plans={plans} current={currentPlan}>
                    {(p) => feeText(p)}
                  </CompareRow>
                  <CompareRow label="Least fee per event" plans={plans} current={currentPlan}>
                    {(p) => {
                      const min = minPerEvent(p);
                      return min ? inr(min) : "None";
                    }}
                  </CompareRow>
                  {cat.catalog.map((g) => (
                    <Fragment key={g.group}>
                      <tr>
                        <th
                          colSpan={plans.length + 1}
                          className="border-b border-border bg-muted/50 px-4 py-2 text-left text-xs font-medium text-muted-foreground"
                        >
                          {g.group}
                        </th>
                      </tr>
                      {g.rows.map((r) => (
                        <CompareRow key={r.label} label={r.label} plans={plans} current={currentPlan}>
                          {(p) => cell(r, p)}
                        </CompareRow>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Buyers pay a {cat?.buyerProcessingFeePercent ?? 4}% processing fee on paid tickets
        {cat?.buyerProcessingFeeCapPerTicket ? `, capped at ₹${cat.buyerProcessingFeeCapPerTicket} per ticket,` : ""} on
        every plan. You can include it in your price from each event&apos;s Tickets page. Razorpay&apos;s charges come
        out of that fee. Free RSVP events carry no fees.
      </p>
    </div>
  );
}

/** Feature lines a plan turns on that the plan below it doesn't. */
function newFeatures(catalog: PlanCatalog["catalog"], plan: PlanInfo, prev: PlanInfo): string[] {
  return catalog.flatMap((g) => g.rows).filter((r) => r.flag && plan[r.flag] && !prev[r.flag]).map((r) => r.label);
}

/** One comparison cell: a tick, a dash, or the plan's limit. */
function cell(r: CatalogRow, p: PlanInfo) {
  if (r.limit) return limitLabel(p[r.limit]);
  const on = r.flag ? p[r.flag] : true;
  return on ? (
    <Check className="h-4 w-4 text-success" weight="bold" aria-label="Included" />
  ) : (
    <Minus className="h-4 w-4 text-muted-foreground/60" aria-label="Not included" />
  );
}

function CompareRow({
  label,
  plans,
  current,
  children,
}: {
  label: string;
  plans: PlanInfo[];
  current: OrgPlan;
  children: (p: PlanInfo) => React.ReactNode;
}) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 border-b border-border bg-card px-4 py-2.5 text-left font-normal text-foreground">
        {label}
      </th>
      {plans.map((p) => (
        <td
          key={p.plan}
          className={cn("border-b border-border px-3 py-2.5 tabular-nums text-foreground", p.plan === current && "bg-primary-soft/60")}
        >
          {children(p)}
        </td>
      ))}
    </tr>
  );
}

function Meter({
  label,
  used,
  limit,
  loading,
}: {
  label: string;
  used?: number;
  limit: number | null | undefined;
  loading: boolean;
}) {
  const pct = used !== undefined && limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-20" />
      ) : (
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
          {used !== undefined ? `${used} / ${limitLabel(limit)}` : limitLabel(limit)}
        </p>
      )}
      {pct !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full", pct >= 100 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" weight="bold" />
      <span>{children}</span>
    </li>
  );
}
