"use client";

import { inr } from "@/lib/utils/money";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Check, Minus, Lock } from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import {
  getSpaceSubscription,
  getSpaceUsage,
  getPlanCatalog,
  cancelSpaceSubscription,
  createSpaceUpgradeOrder,
  verifySpaceUpgrade,
  billingSummary,
  priceFor,
  planRank,
  PLAN_LABEL,
  PLAN_ORDER,
  type Subscription,
  type SubscriptionUsage,
  type PlanInfo,
  type PlanCatalog,
  type CatalogRow,
  type OrgPlan,
  type BillingCycle,
} from "@/lib/api/subscriptions-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { GO_LIVE, RATE } from "@/components/shell/FeeNoticeBanner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

/** Best annual saving across plans, from the API's prices: "Save 17%". */
function annualSaving(plans: PlanInfo[]): string | null {
  const best = Math.max(
    0,
    ...plans.map((p) =>
      p.monthlyPrice && p.annualPrice ? Math.round((1 - p.annualPrice / (p.monthlyPrice * 12)) * 100) : 0
    )
  );
  return best > 0 ? `Save ${best}%` : null;
}

/** A plan's organiser fee, or the announced rate before go-live (the DB holds 0 until then). */
function feePercent(plan: PlanInfo): number {
  return new Date() < GO_LIVE && !plan.platformFeePercent ? RATE[plan.plan] ?? 0 : plan.platformFeePercent;
}

/** "1.5%", or Enterprise's negotiated range "0–0.5%". */
function feeText(plan: PlanInfo): string {
  const pct = feePercent(plan);
  return plan.plan === "ENTERPRISE" && pct ? `0–${pct}%` : `${pct}%`;
}

function feeLabel(plan: PlanInfo): string {
  const pct = feePercent(plan);
  if (!pct) return "No platform fee";
  return `${feeText(plan)} fee per paid ticket${new Date() < GO_LIVE && !plan.platformFeePercent ? " from 2 Nov" : ""}`;
}

/** Human label for a plan limit; `null`/undefined means unlimited. */
function limitLabel(n: number | null | undefined): string {
  return n === null || n === undefined ? "Unlimited" : n.toLocaleString("en-IN");
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function BillingPage() {
  const spaceId = useSpaceId();
  const { currentSpace, can } = useSession();
  const allowed = can("space:manage-billing");

  const [sub, setSub] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const [cat, setCat] = useState<PlanCatalog | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("MONTHLY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyPlan, setBusyPlan] = useState<OrgPlan | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

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
    // Default the toggle to whatever the space is already billed on.
    if (subRes.data?.billingCycle) setCycle(subRes.data.billingCycle);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  async function handleCancel() {
    const ok = await confirmDialog({
      title: "Cancel this plan?",
      description: "You keep it until the end of this period, then the space moves to General. Your data is kept.",
      confirmLabel: "Cancel plan",
      destructive: true,
    });
    if (!ok) return;
    setBusyPlan(sub?.plan ?? "STARTER");
    setActionError("");
    const { error } = await cancelSpaceSubscription(spaceId);
    if (error) setActionError(error.message);
    else await load();
    setBusyPlan(null);
  }

  async function handleChangePlan(plan: OrgPlan, targetCycle: BillingCycle) {
    setActionError("");
    setNotice("");
    setBusyPlan(plan);
    const { data: order, error } = await createSpaceUpgradeOrder(spaceId, { plan, billingCycle: targetCycle });
    if (error || !order) {
      setActionError(error?.message ?? "Could not start checkout");
      setBusyPlan(null);
      return;
    }
    if (!(await loadRazorpay())) {
      setActionError("Could not load the payment window. Check your connection.");
      setBusyPlan(null);
      return;
    }
    new window.Razorpay({
      key: order.razorpayKeyId,
      order_id: order.orderId,
      amount: Math.round(order.amount * 100),
      currency: order.currency,
      name: "Unifesto",
      description: `${PLAN_LABEL[plan]} plan (${targetCycle.toLowerCase()})`,
      notes: { spaceId },
      handler: async (res: RazorpaySuccess) => {
        const { error } = await verifySpaceUpgrade(spaceId, {
          orderId: res.razorpay_order_id,
          paymentId: res.razorpay_payment_id,
          signature: res.razorpay_signature,
        });
        if (error) {
          // Paid but not activated: the payment id lets support attach it.
          setActionError(
            `Payment received but the plan didn't activate (${error.message}). Reference ${res.razorpay_payment_id}.`
          );
        } else {
          setNotice(
            order.kind === "renew"
              ? `${PLAN_LABEL[plan]} renewed.`
              : order.kind === "downgrade"
                ? `${PLAN_LABEL[plan]} (${targetCycle.toLowerCase()}) starts when this period ends.`
                : `You're on ${PLAN_LABEL[plan]} now.`
          );
          await load();
        }
        setBusyPlan(null);
      },
      modal: { ondismiss: () => setBusyPlan(null) },
    }).open();
  }

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plan & billing" />
        <EmptyState
          icon={Lock}
          title="Billing is for Space Admins"
          description="Only a Space Admin can view or change this space's plan."
        />
      </div>
    );
  }

  const plans = [...(cat?.plans ?? [])].sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan));
  const currentPlan: OrgPlan = sub?.plan ?? "STARTER";
  const currentRank = planRank(currentPlan);
  const status = sub?.status ?? "ACTIVE";
  // A paid plan Unifesto gave without a payment (comp): nothing to cancel or renew.
  const comp = currentRank > 0 && !sub?.lastPaymentAt;
  const canBuy = !comp && !sub?.pendingPlan;
  const paidTimeLeft = currentRank > 0 && !!sub?.expiresAt && new Date(sub.expiresAt) > new Date();
  const saving = annualSaving(plans);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Plan & billing"
        subtitle={currentSpace ? `Billing for ${currentSpace.name}` : "Your space's plan"}
      />

      {error && <ErrorNotice message={error} />}
      {actionError && <ErrorNotice message={actionError} />}
      {notice && (
        <div className="rounded-lg border border-border bg-primary-soft px-4 py-3 text-sm text-primary">{notice}</div>
      )}

      {/* Current plan ------------------------------------------------------ */}
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Your plan</p>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-40" />
              ) : (
                <>
                  <h2 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold text-foreground">
                    {PLAN_LABEL[currentPlan]}
                    <StatusPill sub={sub} comp={comp} />
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sub ? (currentRank === 0 ? "Free" : comp ? "Set up by Unifesto" : billingSummary(sub)) : "No plan set"}
                    {cat && ` · ${feeLabel(plans.find((p) => p.plan === currentPlan) ?? plans[0])}`}
                  </p>
                </>
              )}
            </div>
            {!loading && currentRank > 0 && !comp && status !== "EXPIRED" && !sub?.cancelledAt && (
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={busyPlan !== null}>
                Cancel plan
              </Button>
            )}
          </div>

          {!loading && sub && currentRank > 0 && (
            <dl className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3">
              <Fact label={status !== "ACTIVE" ? "Expired on" : sub.cancelledAt ? "Ends" : "Renews"} value={fmtDate(sub.expiresAt)} />
              <Fact label="Last payment" value={fmtDate(sub.lastPaymentAt)} />
              <Fact label="Billed" value={sub.billingCycle === "ANNUAL" ? "Yearly" : "Monthly"} />
              {sub.pendingPlan && (
                <p className="col-span-full text-sm text-muted-foreground">
                  Moves to {PLAN_LABEL[sub.pendingPlan]}
                  {sub.pendingBillingCycle ? ` (${sub.pendingBillingCycle.toLowerCase()})` : ""} on{" "}
                  {fmtDate(sub.expiresAt)}. Already paid.
                </p>
              )}
            </dl>
          )}

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
          {!loading && status === "EXPIRED" && (
            <p className="text-sm text-muted-foreground">
              Your {PLAN_LABEL[currentPlan]} plan expired, so General&apos;s limits apply. Your data is kept; renew to
              get them back.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plans ------------------------------------------------------------- */}
      <section className="space-y-4" aria-labelledby="plans-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plans-heading" className="text-lg font-semibold text-foreground">
            Plans
          </h2>
          <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-sm" role="group" aria-label="Billing cycle">
            {(["MONTHLY", "ANNUAL"] as BillingCycle[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  cycle === c ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {c === "MONTHLY" ? "Monthly" : "Yearly"}
                {c === "ANNUAL" && saving && <span className="ml-1.5 text-xs text-success">{saving}</span>}
              </button>
            ))}
          </div>
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
              const rank = planRank(plan.plan);
              const price = priceFor(plan, cycle);
              const isEnterprise = plan.plan === "ENTERPRISE";
              // Same plan: yearly is "up" from monthly, monthly "down" from yearly.
              const cycleRank = (c: BillingCycle) => (c === "ANNUAL" ? 1 : 0);
              const diff = rank - currentRank || (sub ? cycleRank(cycle) - cycleRank(sub.billingCycle) : 0);
              const direction = diff > 0 ? "up" : diff < 0 ? "down" : "same";
              const prev = plans[i - 1];
              const adds = prev ? newFeatures(cat?.catalog ?? [], plan, prev) : [];

              return (
                <Card
                  key={plan.plan}
                  className={cn("flex flex-col", isCurrent && "border-primary ring-1 ring-primary")}
                >
                  <CardContent className="flex flex-1 flex-col gap-4 p-5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-foreground">{PLAN_LABEL[plan.plan]}</h3>
                        {isCurrent && (
                          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                            Current
                          </span>
                        )}
                      </div>
                      {plan.tagline && <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>}
                    </div>

                    <div>
                      {isEnterprise ? (
                        <span className="text-2xl font-semibold text-foreground">Custom</span>
                      ) : !price ? (
                        <span className="text-2xl font-semibold text-foreground">Free</span>
                      ) : (
                        <>
                          <span className="text-2xl font-semibold tabular-nums text-foreground">{inr(price)}</span>
                          <span className="text-sm text-muted-foreground">/{cycle === "MONTHLY" ? "mo" : "yr"}</span>
                        </>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">{feeLabel(plan)}</p>
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

                    <PlanAction
                      isCurrent={isCurrent}
                      isEnterprise={isEnterprise}
                      direction={direction}
                      canBuy={canBuy}
                      price={price}
                      pending={!!sub?.pendingPlan}
                      busy={busyPlan === plan.plan}
                      disabled={busyPlan !== null}
                      paidTimeLeft={paidTimeLeft}
                      onBuy={() => handleChangePlan(plan.plan, cycle)}
                    />
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
                  <CompareRow label="Price" plans={plans} current={currentPlan}>
                    {(p) => {
                      const price = priceFor(p, cycle);
                      return p.plan === "ENTERPRISE" ? "Custom" : price ? `${inr(price)}/${cycle === "MONTHLY" ? "mo" : "yr"}` : "Free";
                    }}
                  </CompareRow>
                  <CompareRow label="Platform fee per paid ticket" plans={plans} current={currentPlan}>
                    {(p) => feeText(p)}
                  </CompareRow>
                  {cat.catalog.map((g) => (
                    <Fragment key={g.group}>
                      <tr>
                        <th
                          colSpan={plans.length + 1}
                          className="border-b border-border bg-muted/50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
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
        Buyers pay a {cat?.buyerProcessingFeePercent ?? 5}% processing fee on paid tickets
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

function PlanAction({
  isCurrent,
  isEnterprise,
  direction,
  canBuy,
  price,
  pending,
  busy,
  disabled,
  paidTimeLeft,
  onBuy,
}: {
  isCurrent: boolean;
  isEnterprise: boolean;
  direction: "up" | "down" | "same";
  canBuy: boolean;
  price: number | null;
  pending: boolean;
  busy: boolean;
  disabled: boolean;
  paidTimeLeft: boolean;
  onBuy: () => void;
}) {
  if (isCurrent && (direction === "same" || !canBuy || !price)) {
    return direction === "same" && canBuy && price ? (
      <Button className="w-full" disabled={disabled} onClick={onBuy}>
        {busy ? "Working…" : "Renew"}
      </Button>
    ) : (
      <Button variant="outline" disabled className="w-full">
        Current plan
      </Button>
    );
  }
  if (isEnterprise) {
    return (
      <Button variant="outline" className="w-full" asChild>
        <a href="mailto:sales@unifesto.app?subject=Enterprise%20plan">Talk to us</a>
      </Button>
    );
  }
  if (!canBuy) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        {pending ? "A plan change is already scheduled." : "Your plan is set up by Unifesto. Contact support to change it."}
      </p>
    );
  }
  if (direction === "down" && !price) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        To move down, cancel your plan. It ends at the close of this period.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button className="w-full" variant={direction === "down" ? "outline" : "default"} disabled={disabled || !price} onClick={onBuy}>
        {busy ? "Working…" : direction === "down" && paidTimeLeft ? "Switch at period end" : "Upgrade"}
      </Button>
      {direction === "up" && paidTimeLeft && !!price && (
        <p className="text-center text-xs text-muted-foreground">Starts now. Unused days come off the price.</p>
      )}
    </div>
  );
}

function StatusPill({ sub, comp }: { sub: Subscription | null; comp: boolean }) {
  if (!sub) return null;
  const [label, cls] =
    sub.status === "GRACE"
      ? ["Grace period", "bg-warning-soft text-warning"]
      : sub.status === "EXPIRED"
        ? ["Expired", "bg-destructive/10 text-destructive"]
        : sub.cancelledAt
          ? ["Cancelled", "bg-warning-soft text-warning"]
          : comp
            ? ["Comp", "bg-muted text-muted-foreground"]
            : ["Active", "bg-success-soft text-success"];
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>;
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
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

type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    // ponytail: untyped checkout.js options; add a types package if we use more of it.
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

/** Inject Razorpay's checkout.js once; resolves false if it can't load. */
function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
