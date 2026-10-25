"use client";

import { inr } from "@/lib/utils/money";
import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  CalendarBlank,
  Buildings,
  Check,
  Lock,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { can } from "@/lib/types/rbac";
import {
  getSpaceSubscription,
  getSpaceUsage,
  getAllPlans,
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
  type OrgPlan,
  type BillingCycle,
} from "@/lib/api/subscriptions-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ANNUAL_DISCOUNT_LABEL = "Save 12%";

/** Human label for a plan limit; `null`/undefined means unlimited. */
function limitLabel(n: number | null | undefined): string {
  return n === null || n === undefined ? "Unlimited" : n.toLocaleString("en-IN");
}

/** The feature lines shown on each plan card, in display order. */
const PLAN_FEATURES: { key: keyof PlanInfo; label: string }[] = [
  { key: "hasWaitlist", label: "Waiting lists" },
  { key: "hasAnalytics", label: "Analytics & reports" },
  { key: "hasSessions", label: "Sessions" },
  { key: "hasCertificates", label: "Certificates" },
  { key: "hasLeaderboard", label: "Leaderboards" },
  { key: "hasRemoveBranding", label: "Remove Unifesto branding" },
  { key: "hasPrioritySupport", label: "Priority support" },
];

export default function BillingPage() {
  const spaceId = useSpaceId();
  const { currentSpace, currentRole } = useSession();
  const allowed = can(currentRole, "space:manage-billing");

  const [sub, setSub] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
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
    const [subRes, usageRes, plansRes] = await Promise.all([
      getSpaceSubscription(spaceId),
      getSpaceUsage(spaceId),
      getAllPlans(),
    ]);
    if (subRes.error) setError(subRes.error.message);
    else setSub(subRes.data);
    if (usageRes.data) setUsage(usageRes.data);
    if (plansRes.data) setPlans(plansRes.data);
    // Default the toggle to whatever the space is already billed on.
    if (subRes.data?.billingCycle) setCycle(subRes.data.billingCycle);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  async function handleCancel() {
    if (
      !window.confirm(
        "Cancel this plan? You keep it until the end of this period, then the space moves to Starter."
      )
    )
      return;
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
    const { data: order, error } = await createSpaceUpgradeOrder(spaceId, {
      plan,
      billingCycle: targetCycle,
    });
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

  const currentPlan: OrgPlan = sub?.plan ?? "STARTER";
  // Free and revenue-share spaces are arranged by Unifesto: no self-serve plan changes.
  const selfServe = !sub?.billingModel || sub.billingModel === "SUBSCRIPTION";
  const currentRank = planRank(currentPlan);
  const status = sub?.status ?? "ACTIVE";
  // A paid plan Unifesto gave without a payment (comp): nothing to cancel or renew.
  const comp = selfServe && currentRank > 0 && !sub?.lastPaymentAt;
  const canBuy = selfServe && !comp && !sub?.pendingPlan;
  const fmtDate = (d: string | null | undefined) =>
    d
      ? new Date(d).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
  const limitsFrom =
    sub?.billingModel === "FREE"
      ? "Limits come from your free arrangement with Unifesto."
      : sub?.billingModel === "REVENUE_SHARE"
        ? "Limits come from your revenue-share arrangement with Unifesto."
        : status === "EXPIRED"
          ? `Your ${PLAN_LABEL[currentPlan]} plan expired, so Starter limits apply. Your data is kept; renew to get them back.`
          : `Limits come from your ${PLAN_LABEL[currentPlan]} plan${comp ? ", set up by Unifesto" : ""}.`;
  const orderedPlans = [...plans].sort(
    (a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan & billing"
        subtitle={
          currentSpace ? `Billing for ${currentSpace.name}` : "Your space's plan"
        }
      />

      {error && <ErrorNotice message={error} />}
      {actionError && <ErrorNotice message={actionError} />}
      {notice && (
        <div className="rounded-lg border border-border bg-primary-soft px-4 py-3 text-sm text-primary">
          {notice}
        </div>
      )}

      {/* Current plan ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" weight="fill" />
                {loading ? (
                  // Inline span (not the div-based Skeleton) — CardTitle is an
                  // <h3> and CardDescription a <p>, neither of which may nest a div.
                  <span className="inline-block h-6 w-32 animate-pulse rounded-md bg-muted align-middle" />
                ) : (
                  `${PLAN_LABEL[currentPlan]} plan`
                )}
              </CardTitle>
              <CardDescription>
                {loading ? (
                  <span className="inline-block h-4 w-48 animate-pulse rounded-md bg-muted align-middle" />
                ) : sub ? (
                  billingSummary(sub)
                ) : (
                  "No arrangement set"
                )}
              </CardDescription>
            </div>
            {!loading && currentRank > 0 && selfServe && !comp && status !== "EXPIRED" && !sub?.cancelledAt && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={busyPlan !== null}
              >
                Cancel plan
              </Button>
            )}
          </div>
        </CardHeader>
        {!loading && sub && (
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MiniFact
                label="Status"
                value={
                  status === "GRACE"
                    ? "Grace period: renew to keep it"
                    : status === "EXPIRED"
                      ? "Expired"
                      : sub.isActive
                        ? "Active"
                        : "Inactive"
                }
              />
              <MiniFact
                label={
                  status !== "ACTIVE"
                    ? "Expired on"
                    : sub.cancelledAt
                      ? "Ends"
                      : "Renews"
                }
                value={fmtDate(sub.expiresAt)}
              />
              <MiniFact label="Last payment" value={fmtDate(sub.lastPaymentAt)} />
            </div>
            {sub.pendingPlan && (
              <p className="mt-4 text-sm text-muted-foreground">
                Moves to {PLAN_LABEL[sub.pendingPlan]}
                {sub.pendingBillingCycle
                  ? ` (${sub.pendingBillingCycle.toLowerCase()})`
                  : ""}{" "}
                on {fmtDate(sub.expiresAt)}. Already paid.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Usage ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Events this month"
          value={
            usage
              ? `${usage.eventsThisMonth} / ${limitLabel(
                  usage.limits.eventsPerMonth
                )}`
              : "—"
          }
          icon={CalendarBlank}
          loading={loading}
          tone="brand"
        />
        <StatCard
          title="Spaces"
          value={
            usage
              ? `${usage.spacesCount} / ${limitLabel(usage.limits.spaces)}`
              : "—"
          }
          icon={Buildings}
          loading={loading}
        />
        <StatCard
          title="Attendees / event"
          value={usage ? limitLabel(usage.limits.attendeesPerEvent) : "—"}
          icon={CreditCard}
          loading={loading}
          hint="Plan limit"
        />
      </div>
      {!loading && sub && (
        <p className="-mt-2 text-sm text-muted-foreground">{limitsFrom}</p>
      )}

      {/* Plan catalogue --------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Plans</h2>
        {/* Monthly / annual toggle */}
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-sm">
          {(["MONTHLY", "ANNUAL"] as BillingCycle[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                cycle === c
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {c === "MONTHLY" ? "Monthly" : "Annual"}
              {c === "ANNUAL" && (
                <span className="ml-1.5 text-xs text-success">
                  {ANNUAL_DISCOUNT_LABEL}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {orderedPlans.map((plan) => {
            const isCurrent = plan.plan === currentPlan;
            const rank = planRank(plan.plan);
            const price = priceFor(plan, cycle);
            const isEnterprise = plan.plan === "ENTERPRISE";
            // Same plan: annual is "up" from monthly, monthly "down" from annual.
            const cycleRank = (c: BillingCycle) => (c === "ANNUAL" ? 1 : 0);
            const diff =
              rank - currentRank ||
              (sub ? cycleRank(cycle) - cycleRank(sub.billingCycle) : 0);
            const direction = diff > 0 ? "up" : diff < 0 ? "down" : "same";
            const paidTimeLeft =
              currentRank > 0 &&
              !!sub?.expiresAt &&
              new Date(sub.expiresAt) > new Date();

            return (
              <Card
                key={plan.plan}
                className={cn(
                  "flex flex-col",
                  isCurrent && "border-primary ring-1 ring-primary"
                )}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {PLAN_LABEL[plan.plan]}
                    {isCurrent && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                        Current
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {isEnterprise ? (
                      <span className="text-lg font-semibold text-foreground">
                        Custom
                      </span>
                    ) : price === null || price === 0 ? (
                      <span className="text-lg font-semibold text-foreground">
                        Free
                      </span>
                    ) : (
                      <span>
                        <span className="text-2xl font-semibold text-foreground">
                          {inr(price)}
                        </span>
                        <span className="text-muted-foreground">
                          /{cycle === "MONTHLY" ? "mo" : "yr"}
                        </span>
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <ul className="flex-1 space-y-2 text-sm">
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <Check className="h-4 w-4 text-success" weight="bold" />
                      {limitLabel(plan.eventsPerMonth)} events / month
                    </li>
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <Check className="h-4 w-4 text-success" weight="bold" />
                      {limitLabel(plan.attendeesPerEvent)} attendees / event
                    </li>
                    {PLAN_FEATURES.filter((f) => plan[f.key]).map((f) => (
                      <li
                        key={f.key}
                        className="flex items-center gap-2 text-muted-foreground"
                      >
                        <Check className="h-4 w-4 text-success" weight="bold" />
                        {f.label}
                      </li>
                    ))}
                  </ul>

                  {isCurrent && (direction === "same" || !canBuy || !price) ? (
                    direction === "same" && canBuy && price ? (
                      <Button
                        className="w-full"
                        disabled={busyPlan !== null}
                        onClick={() => handleChangePlan(plan.plan, cycle)}
                      >
                        {busyPlan === plan.plan ? "Working…" : "Renew"}
                      </Button>
                    ) : (
                      <Button variant="outline" disabled className="w-full">
                        Current plan
                      </Button>
                    )
                  ) : isEnterprise ? (
                    <Button variant="outline" className="w-full" asChild>
                      <a href="mailto:sales@unifesto.app?subject=Enterprise%20plan">
                        Contact sales
                      </a>
                    </Button>
                  ) : !selfServe ? (
                    <p className="text-center text-xs text-muted-foreground">
                      Your plan is arranged by Unifesto. Contact support to
                      change it.
                    </p>
                  ) : !canBuy ? (
                    <p className="text-center text-xs text-muted-foreground">
                      {sub?.pendingPlan
                        ? "A plan change is already scheduled."
                        : "Your plan is set up by Unifesto. Contact support to change it."}
                    </p>
                  ) : direction === "down" && !price ? (
                    <p className="text-center text-xs text-muted-foreground">
                      To move down, cancel your plan. It ends at the close of
                      this period.
                    </p>
                  ) : (
                    <Button
                      className="w-full"
                      variant={direction === "down" ? "outline" : "default"}
                      disabled={busyPlan !== null || !price}
                      onClick={() => handleChangePlan(plan.plan, cycle)}
                    >
                      {busyPlan === plan.plan
                        ? "Working…"
                        : direction === "down" && paidTimeLeft
                          ? "Switch at period end"
                          : "Upgrade"}
                    </Button>
                  )}
                  {direction === "up" && paidTimeLeft && canBuy && !!price && (
                    <p className="text-center text-xs text-muted-foreground">
                      Starts now. Unused days on your current plan come off the
                      price.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
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

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
