"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  CalendarBlank,
  Buildings,
  Check,
  Lock,
} from "@phosphor-icons/react";
import { useSession } from "@/lib/context/SessionContext";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { can } from "@/lib/types/rbac";
import {
  getSpaceSubscription,
  getSpaceUsage,
  getAllPlans,
  cancelSpaceSubscription,
  createSpaceUpgradeOrder,
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
        "Cancel this plan and drop to Starter at the end of the period?"
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

  // -----------------------------------------------------------------------
  // TODO(contribution): implement the paid upgrade handler.
  //
  // The read-only surface below is done. This handler owns the ONE decision
  // this feature still needs — how a Space Admin actually pays. The backend
  // is already wired for it:
  //
  //   1. createSpaceUpgradeOrder(spaceId, { plan, billingCycle })
  //        → { orderId, amount, currency }   (a Razorpay order)
  //   2. open Razorpay checkout for that order and let the admin pay
  //   3. verifySpaceUpgrade(spaceId, { orderId, paymentId, signature })
  //        → the activated Subscription, then call load()
  //
  // Step 2 is the open question and why this is stubbed rather than guessed:
  // there is NO existing Razorpay checkout pattern anywhere in web/mobile/apex
  // to copy, and no public key is configured yet. The choices that shape it:
  //   • Razorpay modal (load checkout.razorpay.com/v1/checkout.js) — needs a
  //     NEXT_PUBLIC_RAZORPAY_KEY_ID and a CSP allowance in proxy.ts for that
  //     host + frame; smoothest UX, keeps the admin in-app.
  //   • Hosted redirect — no script/CSP work, but bounces out and back.
  //   • Downgrades: the backend upgrade route rejects same-or-lower paid moves;
  //     decide whether "downgrade" here just schedules a drop at renewal
  //     (cancel semantics) or is disabled with a note.
  //
  // Wire steps 1 & 3 through the api client already imported above; add step 2
  // once the checkout approach is chosen.
  async function handleChangePlan(plan: OrgPlan, targetCycle: BillingCycle) {
    setActionError("");
    setNotice("");
    setBusyPlan(plan);
    try {
      const { data, error } = await createSpaceUpgradeOrder(spaceId, {
        plan,
        billingCycle: targetCycle,
      });
      if (error) {
        setActionError(error.message);
        return;
      }
      if (data) {
        // Order created; checkout + verifySpaceUpgrade() land with the payment
        // integration (see TODO above).
        setNotice(
          `Ready to charge ₹${data.amount.toLocaleString("en-IN")} for ${
            PLAN_LABEL[plan]
          } (${targetCycle.toLowerCase()}). Payment checkout is not wired up yet.`
        );
      }
    } finally {
      setBusyPlan(null);
    }
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
  const currentRank = planRank(currentPlan);
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
            {!loading && currentRank > 0 && (
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
                value={sub.isActive ? "Active" : "Inactive"}
              />
              <MiniFact
                label={sub.cancelledAt ? "Ends" : "Renews"}
                value={
                  sub.expiresAt
                    ? new Date(sub.expiresAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"
                }
              />
              <MiniFact
                label="Last payment"
                value={
                  sub.lastPaymentAt
                    ? new Date(sub.lastPaymentAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"
                }
              />
            </div>
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
            const direction =
              rank > currentRank ? "up" : rank < currentRank ? "down" : "same";

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
                          ₹{price.toLocaleString("en-IN")}
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

                  {isCurrent ? (
                    <Button variant="outline" disabled className="w-full">
                      Current plan
                    </Button>
                  ) : isEnterprise ? (
                    <Button variant="outline" className="w-full" asChild>
                      <a href="mailto:sales@unifesto.app?subject=Enterprise%20plan">
                        Contact sales
                      </a>
                    </Button>
                  ) : (
                    <Button
                      variant={direction === "up" ? "default" : "outline"}
                      className="w-full"
                      disabled={busyPlan !== null || price === null}
                      onClick={() => handleChangePlan(plan.plan, cycle)}
                    >
                      {busyPlan === plan.plan
                        ? "Working…"
                        : direction === "up"
                          ? "Upgrade"
                          : "Downgrade"}
                    </Button>
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
