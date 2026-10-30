"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  CurrencyInr,
  CheckCircle,
  Crown,
  Users,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { SpaceDealsCard } from "@/components/spaces/SpaceDealsCard";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import {
  listSpaceSubscriptions,
  getSpaceBillingStats,
  adminUpdateSpaceSubscription,
  recordOfflinePayment,
  getSpacePlanPrices,
  planPriceLabel,
  spaceSubName,
  spaceAdminEmail,
  spaceAdminName,
  billingSummary,
  PLAN_LABEL,
  SELLABLE_PLANS,
  BILLING_CYCLE_LABEL,
  type SpaceSubscription,
  type BillingStats,
  type OrgPlan,
  type BillingCycle,
  type PlanPrice,
} from "@/lib/api/subscriptions-api";

const CYCLES = Object.keys(BILLING_CYCLE_LABEL) as BillingCycle[];
const PAID_PLANS: OrgPlan[] = SELLABLE_PLANS.filter((p) => p !== "STARTER");

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** One word for where a space's plan stands, and its badge colour. */
function standing(s: SpaceSubscription): { label: string; variant: "neutral" | "success" | "warning" | "destructive" } {
  if (!s.configured) return { label: "Not set up", variant: "warning" };
  if (!s.isActive) return { label: "Inactive", variant: "destructive" };
  if (s.status === "EXPIRED") return { label: "Expired", variant: "destructive" };
  if (s.status === "GRACE") return { label: "Grace", variant: "warning" };
  if (s.cancelledAt) return { label: "Cancelled", variant: "warning" };
  if (s.plan && s.plan !== "STARTER" && !s.lastPaymentAt) return { label: "Comp", variant: "neutral" };
  return { label: "Active", variant: "success" };
}

/**
 * Admin billing surface. Every space is on one plan (General, Club, Growth,
 * Pro or Enterprise); admins move a space between plans, record offline
 * payments and set per-space deals here. Backed by `/subscription/admin/*`.
 */
export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<SpaceSubscription[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<OrgPlan | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SpaceSubscription | null>(null);

  const loadStats = useCallback(async () => {
    const { data } = await getSpaceBillingStats();
    if (data) setStats(data);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await listSpaceSubscriptions({
      plan: plan === "ALL" ? undefined : plan,
      search: search.trim() || undefined,
      limit: 100,
    });
    if (error) {
      setError(error.message || "Could not load subscriptions.");
      setSubs([]);
    } else setSubs(data?.data ?? []);
    setLoading(false);
  }, [plan, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (selected) {
    return (
      <SpacePlan
        sub={selected}
        onBack={() => setSelected(null)}
        onSaved={async (updated) => {
          setSelected(updated);
          await Promise.all([loadList(), loadStats()]);
        }}
      />
    );
  }

  const onPaid = stats ? stats.total - stats.notConfigured - (stats.byPlan.STARTER ?? 0) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Subscriptions" subtitle="Every space and the plan it's on." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Spaces"
          value={stats?.total ?? 0}
          hint={stats?.notConfigured ? `${stats.notConfigured} not set up` : "All on a plan"}
          icon={CreditCard}
          loading={!stats}
        />
        <StatCard
          title="On a paid plan"
          value={onPaid}
          hint={stats ? `${Math.max(0, onPaid - stats.paying)} comped` : undefined}
          icon={Crown}
          tone="brand"
          loading={!stats}
        />
        <StatCard title="Paying" value={stats?.paying ?? 0} hint="Live payment behind the plan" icon={Users} loading={!stats} />
        <StatCard
          title="MRR"
          value={`₹${(stats?.mrr ?? 0).toLocaleString("en-IN")}`}
          hint="From payments, not list prices"
          icon={CurrencyInr}
          tone="success"
          loading={!stats}
        />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="text-base">Spaces</CardTitle>
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search space"
                className="w-56 pl-9"
                aria-label="Search spaces"
              />
            </div>
          </div>
          <PlanFilter stats={stats} value={plan} onChange={setPlan} />
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4">
              <ErrorNotice message={error} />
            </div>
          )}
          {loading ? (
            <div className="space-y-px">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="ml-auto h-5 w-20" />
                </div>
              ))}
            </div>
          ) : subs.length === 0 ? (
            <EmptyState icon={CreditCard} title="No spaces" description="No space matches this plan or search." />
          ) : (
            <div role="table" aria-label="Spaces and their plans">
              <div
                role="row"
                className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1.3fr_1fr_1fr_0.7fr_16px] gap-4 border-y border-border px-6 py-2 text-xs text-muted-foreground md:grid"
              >
                <span role="columnheader">Space</span>
                <span role="columnheader">Plan</span>
                <span role="columnheader">Price now</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Renews</span>
                <span role="columnheader" className="text-right">Events</span>
                <span />
              </div>
              {subs.map((s) => {
                const st = standing(s);
                return (
                  <button
                    key={s.spaceId}
                    role="row"
                    onClick={() => setSelected(s)}
                    className="grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-border px-6 py-3.5 text-left transition-colors last:border-0 hover:bg-muted/40 md:grid-cols-[minmax(0,2.2fr)_1fr_1.3fr_1fr_1fr_0.7fr_16px] md:items-center"
                  >
                    <span role="cell" className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{spaceSubName(s)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {spaceAdminEmail(s) ?? spaceAdminName(s) ?? "No admin"}
                      </span>
                    </span>
                    <span role="cell" className="text-sm text-foreground">
                      {s.plan ? PLAN_LABEL[s.plan] : "—"}
                    </span>
                    <span role="cell" className="col-span-2 text-xs text-muted-foreground md:col-span-1">
                      {s.plan === "STARTER" ? "Free" : planPriceLabel(s.priceInForce, s.billingCycle)}
                    </span>
                    <span role="cell">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </span>
                    <span role="cell" className="text-xs text-muted-foreground">
                      {s.plan === "STARTER" ? "—" : fmtDate(s.expiresAt)}
                    </span>
                    <span role="cell" className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">
                      {s.eventsThisMonth}
                    </span>
                    <CaretRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Plan chips that filter the list, with how many spaces are on each. */
function PlanFilter({
  stats,
  value,
  onChange,
}: {
  stats: BillingStats | null;
  value: OrgPlan | "ALL";
  onChange: (v: OrgPlan | "ALL") => void;
}) {
  const chips: { key: OrgPlan | "ALL"; label: string; n?: number }[] = [
    { key: "ALL", label: "All", n: stats?.total },
    ...SELLABLE_PLANS.map((p) => ({ key: p, label: PLAN_LABEL[p], n: stats?.byPlan[p] })),
  ];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by plan">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-pressed={value === c.key}
          onClick={() => onChange(c.key)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
            value === c.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {c.label}
          {c.n !== undefined && <span className="tabular-nums opacity-70">{c.n}</span>}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One space: its plan, a manual change, offline payments and deals           */
/* -------------------------------------------------------------------------- */

function SpacePlan({
  sub,
  onBack,
  onSaved,
}: {
  sub: SpaceSubscription;
  onBack: () => void;
  onSaved: (updated: SpaceSubscription) => void;
}) {
  const st = standing(sub);
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
        <CaretLeft className="h-4 w-4" /> Subscriptions
      </Button>

      <PageHeader
        title={spaceSubName(sub)}
        subtitle={[spaceAdminName(sub), spaceAdminEmail(sub)].filter(Boolean).join(" · ") || undefined}
        actions={<Badge variant={st.variant}>{st.label}</Badge>}
      />

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 sm:grid-cols-5">
          <Fact label="Plan" value={sub.plan ? PLAN_LABEL[sub.plan] : "Not set"} />
          <Fact label="Price now" value={sub.plan === "STARTER" ? "Free" : planPriceLabel(sub.priceInForce, sub.billingCycle)} />
          <Fact label={sub.cancelledAt ? "Ends" : "Renews"} value={sub.plan === "STARTER" ? "—" : fmtDate(sub.expiresAt)} />
          <Fact label="Last payment" value={fmtDate(sub.lastPaymentAt)} />
          <Fact label="Events this month" value={String(sub.eventsThisMonth)} />
          {sub.pendingPlan && (
            <p className="col-span-full text-sm text-muted-foreground">
              Moves to {PLAN_LABEL[sub.pendingPlan]} on {fmtDate(sub.expiresAt)}. Already paid.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChangePlan sub={sub} onSaved={onSaved} />
        <OfflinePayment sub={sub} onSaved={(data) => onSaved({ ...sub, ...data, space: sub.space, admin: sub.admin })} />
      </div>

      <SpaceDealsCard spaceId={sub.spaceId} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ChangePlan({ sub, onSaved }: { sub: SpaceSubscription; onSaved: (s: SpaceSubscription) => void }) {
  const [plan, setPlan] = useState<OrgPlan>(sub.plan ?? "STARTER");
  const [cycle, setCycle] = useState<BillingCycle>(sub.billingCycle);
  const [amount, setAmount] = useState(String(Number(sub.amount) || 0));
  const [isActive, setIsActive] = useState(sub.isActive);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const ok = await confirmDialog({
      title: `Put ${spaceSubName(sub)} on ${PLAN_LABEL[plan]}?`,
      description: "It takes effect at once and is logged in the plan history. No payment is taken.",
      confirmLabel: "Change plan",
    });
    if (!ok) return;
    setSaving(true);
    setError("");
    const { data, error } = await adminUpdateSpaceSubscription(sub.spaceId, {
      plan,
      billingCycle: cycle,
      amount: plan === "STARTER" ? 0 : Number(amount) || 0,
      isActive,
      reason: reason.trim() || undefined,
    });
    setSaving(false);
    if (error || !data) {
      setError(error?.message || "Could not change the plan.");
      return;
    }
    setReason("");
    onSaved({ ...sub, ...data, space: sub.space, admin: sub.admin });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Change plan</CardTitle>
        <p className="text-xs text-muted-foreground">Set by Unifesto, no payment. Currently {billingSummary(sub)}.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorNotice message={error} />}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Plan">
          {SELLABLE_PLANS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={plan === p}
              onClick={() => setPlan(p)}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                plan === p ? "border-primary bg-primary-soft text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {PLAN_LABEL[p]}
              {sub.plan === p && <span className="block text-xs text-muted-foreground">Current</span>}
            </button>
          ))}
        </div>
        {plan !== "STARTER" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label id="change-plan-cycle" className="block">Cycle</Label>
              <div role="group" aria-labelledby="change-plan-cycle" className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                {CYCLES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={cycle === c}
                    onClick={() => setCycle(c)}
                    className={cn(
                      "rounded px-3 py-1 text-sm",
                      cycle === c ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {BILLING_CYCLE_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-amount">Amount (₹ per cycle, 0 = comp)</Label>
              <Input id="plan-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
        )}
        <label className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
          <span>
            <span className="block text-sm font-medium text-foreground">Active</span>
            <span className="block text-xs text-muted-foreground">Inactive suspends this space&rsquo;s plan.</span>
          </span>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="plan-reason">Note (logged in history)</Label>
          <Input id="plan-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this changing?" />
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={save} disabled={saving}>
            <CheckCircle className="h-4 w-4" weight="fill" /> {saving ? "Saving…" : "Save plan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Record a bank transfer or cheque: extends the plan by one cycle. */
function OfflinePayment({ sub, onSaved }: { sub: SpaceSubscription; onSaved: (updated: SpaceSubscription) => void }) {
  const [plan, setPlan] = useState<OrgPlan>(sub.plan && PAID_PLANS.includes(sub.plan) ? sub.plan : "CLUB");
  const [cycle, setCycle] = useState<BillingCycle>(sub.billingCycle);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [prices, setPrices] = useState<Partial<Record<OrgPlan, Record<BillingCycle, PlanPrice>>>>({});

  useEffect(() => {
    getSpacePlanPrices(sub.spaceId).then(({ data }) => setPrices(data ?? {}));
  }, [sub.spaceId]);

  // The price in force (deal or rate card) is the default amount.
  const price = prices[plan]?.[cycle];
  const defaultAmount = price?.pricePaise ? price.pricePaise / 100 : null;
  const received = amount.trim() ? Number(amount) : defaultAmount;

  const save = async () => {
    if (!(received != null && received >= 1)) {
      setError("Enter the amount received.");
      return;
    }
    const sameRun = plan === sub.plan && sub.expiresAt && new Date(sub.expiresAt) > new Date();
    const ok = await confirmDialog({
      title: `Record ₹${received.toLocaleString("en-IN")} for ${PLAN_LABEL[plan]}?`,
      description: `${BILLING_CYCLE_LABEL[cycle]}. ${sameRun ? "It extends the current period." : "The new period starts today."}`,
      confirmLabel: "Record payment",
    });
    if (!ok) return;
    setSaving(true);
    setError("");
    const { data, error } = await recordOfflinePayment(sub.spaceId, {
      plan,
      billingCycle: cycle,
      amount: received,
      reference: reference.trim() || undefined,
    });
    setSaving(false);
    if (error || !data) {
      setError(error?.message || "Could not record the payment.");
      return;
    }
    setAmount("");
    setReference("");
    onSaved(data);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Record offline payment</CardTitle>
        <p className="text-xs text-muted-foreground">
          Bank transfer or cheque. Extends the plan one cycle. Current period ends {fmtDate(sub.expiresAt)}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorNotice message={error} />}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Plan paid for">
          {PAID_PLANS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={plan === p}
              onClick={() => setPlan(p)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors",
                plan === p ? "border-primary bg-primary-soft text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {PLAN_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label id="offline-payment-cycle" className="block">Cycle</Label>
            <div role="group" aria-labelledby="offline-payment-cycle" className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              {CYCLES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cycle === c}
                  onClick={() => setCycle(c)}
                  className={cn("rounded px-3 py-1 text-sm", cycle === c ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                >
                  {BILLING_CYCLE_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offline-amt">Amount (₹)</Label>
            <Input
              id="offline-amt"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={defaultAmount != null ? String(defaultAmount) : "Amount"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offline-ref">UTR / cheque no.</Label>
            <Input id="offline-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Recorded once" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Price in force: {planPriceLabel(price, cycle)}
          {defaultAmount != null && !amount.trim() && " (used if the amount is blank)"}
        </p>
        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={save} disabled={saving}>
            <CurrencyInr className="h-4 w-4" /> {saving ? "Recording…" : "Record payment"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
