"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, MagnifyingGlass, CaretLeft, CaretRight, CheckCircle } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { SpaceDealsCard } from "@/components/spaces/SpaceDealsCard";
import { SpaceFeePayerCard } from "@/components/spaces/SpaceFeePayerCard";
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
  getPlanCatalog,
  getSpaceFee,
  adminUpdateSpaceSubscription,
  spaceSubName,
  spaceAdminEmail,
  spaceAdminName,
  PLAN_LABEL,
  SELLABLE_PLANS,
  type SpaceSubscription,
  type BillingStats,
  type OrgPlan,
  type SpaceFee,
} from "@/lib/api/subscriptions-api";

/** A plan's fee as organisers see it: one number on the one processing fee. */
const planFeeText = (rate: number | null | undefined) => (rate == null ? "Old fees" : `${rate}%`);

/** What a space pays, from its own terms: deals included, and who pays. */
const spaceFeeText = (f: SpaceFee) =>
  `${f.percent}%${f.capPerTicket != null ? ` (capped ₹${f.capPerTicket}) + ${f.organiserPercent}% organiser fee` : ""}, ${
    f.included ? "PF included" : "buyer pays"
  }`;

/** Only what needs an admin's eye: a space with no plan row, or a suspended one. */
const flag = (s: SpaceSubscription) => (!s.configured ? "Not set up" : !s.isActive ? "Suspended" : null);

/**
 * Admin: every space, its plan and its processing fee (revenue is a % per
 * ticket only since 2 Nov 2026, so there are no prices, cycles or payments
 * here). Admins move a space between plans, set its deals and who pays the
 * fee. Backed by `/subscription/admin/*`.
 */
export default function SpacePlansPage() {
  const [subs, setSubs] = useState<SpaceSubscription[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [rates, setRates] = useState<Partial<Record<OrgPlan, number | null>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<OrgPlan | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SpaceSubscription | null>(null);

  const loadStats = useCallback(async () => {
    const [{ data }, cat] = await Promise.all([getSpaceBillingStats(), getPlanCatalog()]);
    if (data) setStats(data);
    if (cat.data) setRates(Object.fromEntries(cat.data.plans.map((p) => [p.plan, p.processingFeePercent])));
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
      setError(error.message || "Could not load spaces.");
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Space plans"
        subtitle="Every space, its plan and its processing fee. Open a space to change its plan, set a deal or who pays the fee."
      />

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
            <div role="table" aria-label="Spaces, their plans and fees">
              <div
                role="row"
                className="hidden grid-cols-[minmax(0,2.4fr)_1fr_1fr_0.7fr_16px] gap-4 border-y border-border px-6 py-2 text-xs text-muted-foreground md:grid"
              >
                <span role="columnheader">Space</span>
                <span role="columnheader">Plan</span>
                <span role="columnheader">Processing fee</span>
                <span role="columnheader" className="text-right">Events</span>
                <span />
              </div>
              {subs.map((s) => {
                const note = flag(s);
                return (
                  <button
                    key={s.spaceId}
                    role="row"
                    onClick={() => setSelected(s)}
                    className="grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-border px-6 py-3.5 text-left transition-colors last:border-0 hover:bg-muted/40 md:grid-cols-[minmax(0,2.4fr)_1fr_1fr_0.7fr_16px] md:items-center"
                  >
                    <span role="cell" className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{spaceSubName(s)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {spaceAdminEmail(s) ?? spaceAdminName(s) ?? "No admin"}
                      </span>
                    </span>
                    <span role="cell" className="text-sm text-foreground">
                      {s.plan ? PLAN_LABEL[s.plan] : "—"}
                      {note && <span className="block text-xs text-destructive">{note}</span>}
                    </span>
                    <span role="cell" className="text-sm tabular-nums text-muted-foreground">
                      {s.plan ? planFeeText(rates[s.plan]) : "—"}
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
      <p className="text-xs text-muted-foreground">
        The fee column is each plan&apos;s rate; a space with a deal pays less, shown when you open it.
      </p>
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
            "inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm transition-colors",
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
/* One space: its plan and fee, a plan change, deals and who pays             */
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
  const [fee, setFee] = useState<SpaceFee | null>(null);
  useEffect(() => {
    void getSpaceFee(sub.spaceId).then(({ data }) => setFee(data));
  }, [sub.spaceId, sub.plan]);
  const note = flag(sub);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
        <CaretLeft className="h-4 w-4" /> Space plans
      </Button>

      <PageHeader
        title={spaceSubName(sub)}
        subtitle={[spaceAdminName(sub), spaceAdminEmail(sub)].filter(Boolean).join(" · ") || undefined}
        actions={note ? <Badge variant="destructive">{note}</Badge> : undefined}
      />

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 sm:grid-cols-3">
          <Fact label="Plan" value={sub.plan ? PLAN_LABEL[sub.plan] : "Not set"} />
          <Fact label="Processing fee" value={fee ? spaceFeeText(fee) : "…"} />
          <Fact label="Events this month" value={String(sub.eventsThisMonth)} />
        </CardContent>
      </Card>

      <ChangePlan sub={sub} onSaved={onSaved} />

      <div className="grid gap-4 xl:grid-cols-2">
        <SpaceDealsCard spaceId={sub.spaceId} />
        <SpaceFeePayerCard spaceId={sub.spaceId} />
      </div>
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
  const [isActive, setIsActive] = useState(sub.isActive);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const ok = await confirmDialog({
      title: `Put ${spaceSubName(sub)} on ${PLAN_LABEL[plan]}?`,
      description: "It takes effect at once for new sales, at that plan's processing fee, and is logged in the plan history.",
      confirmLabel: "Change plan",
    });
    if (!ok) return;
    setSaving(true);
    setError("");
    const { data, error } = await adminUpdateSpaceSubscription(sub.spaceId, {
      plan,
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
        <p className="text-xs text-muted-foreground">
          Plans set features, limits and the most the processing fee can be. No payment is taken.
        </p>
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
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium text-foreground">Active</span>
            <span className="block text-xs text-muted-foreground">Off suspends this space&rsquo;s plan.</span>
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
