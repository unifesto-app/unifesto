"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  MagnifyingGlass,
  CaretLeft,
  Gift,
  Percent,
  Crown,
  CurrencyInr,
  CheckCircle,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listSpaceSubscriptions,
  getSpaceBillingStats,
  adminUpdateSpaceSubscription,
  spaceSubName,
  spaceAdminEmail,
  spaceAdminName,
  billingSummary,
  BILLING_MODEL_LABEL,
  PLAN_LABEL,
  BILLING_CYCLE_LABEL,
  type SpaceSubscription,
  type BillingStats,
  type BillingModel,
  type OrgPlan,
  type BillingCycle,
  type AdminUpdateSubscriptionInput,
} from "@/lib/api/subscriptions-api";

const MODEL_FILTERS: { label: string; value: BillingModel | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Free", value: "FREE" },
  { label: "Revenue share", value: "REVENUE_SHARE" },
  { label: "Subscription", value: "SUBSCRIPTION" },
];

const MODELS = Object.keys(BILLING_MODEL_LABEL) as BillingModel[];
const PLANS = Object.keys(PLAN_LABEL) as OrgPlan[];
const CYCLES = Object.keys(BILLING_CYCLE_LABEL) as BillingCycle[];

function modelBadgeVariant(
  model: BillingModel | null
): "neutral" | "brand" | "success" | "warning" {
  if (model === "REVENUE_SHARE") return "brand";
  if (model === "SUBSCRIPTION") return "success";
  if (model === "FREE") return "neutral";
  return "warning"; // not configured
}

function ModelIcon({ model }: { model: BillingModel | null }) {
  const cls = "h-4 w-4";
  if (model === "FREE") return <Gift className={cls} weight="duotone" />;
  if (model === "REVENUE_SHARE") return <Percent className={cls} weight="duotone" />;
  if (model === "SUBSCRIPTION") return <Crown className={cls} weight="duotone" />;
  return null;
}

/**
 * Admin billing surface. The Space is the billing subject — every space is on a
 * free, revenue-share, or subscription arrangement, and admins set it here.
 * "Partnership" = a revenue-share arrangement on a specific space. Backed by the
 * NestJS `/subscription/admin/spaces*` endpoints.
 */
export default function SubscriptionsPage() {
  const { role } = useSession();
  const isAdmin = role === "platform_admin";

  const [subs, setSubs] = useState<SpaceSubscription[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<BillingModel | "ALL">("ALL");
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
      billingModel: filter === "ALL" ? undefined : filter,
      search: search.trim() || undefined,
      limit: 100,
    });
    if (error) {
      setError(error.message || "Could not load subscriptions.");
      setSubs([]);
    } else {
      setSubs(data?.data ?? []);
    }
    setLoading(false);
  }, [filter, search]);

  useEffect(() => {
    if (isAdmin) loadList();
  }, [isAdmin, loadList]);

  useEffect(() => {
    if (isAdmin) loadStats();
  }, [isAdmin, loadStats]);

  const statCards = useMemo(
    () => [
      {
        title: "Spaces",
        value: stats?.total ?? 0,
        hint: stats?.notConfigured
          ? `${stats.notConfigured} not set up`
          : "All set up",
        icon: CreditCard,
        tone: "neutral" as const,
      },
      {
        title: "Free",
        value: stats?.free ?? 0,
        hint: "No platform fee",
        icon: Gift,
        tone: "neutral" as const,
      },
      {
        title: "Revenue share",
        value: stats?.revenueShare ?? 0,
        hint: "% of sales",
        icon: Percent,
        tone: "brand" as const,
      },
      {
        title: "Subscription MRR",
        value: `₹${(stats?.mrr ?? 0).toLocaleString("en-IN")}`,
        hint: `${stats?.subscription ?? 0} on a plan`,
        icon: CurrencyInr,
        tone: "success" as const,
      },
    ],
    [stats]
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Subscriptions" />
        <EmptyState
          icon={CreditCard}
          title="Admins only"
          description="This surface is for platform staff. Space admins manage their plan inside their space."
        />
      </div>
    );
  }

  if (selected) {
    return (
      <EditArrangement
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
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        subtitle="Set how each space is billed — free, revenue-share, or a plan"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <StatCard key={s.title} {...s} loading={!stats} />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Spaces</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search space"
                  className="w-52 pl-9"
                  aria-label="Search spaces"
                />
              </div>
              <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {MODEL_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                      (filter === f.value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4">
              <ErrorNotice message={error} />
            </div>
          )}

          {loading ? (
            <div className="space-y-px">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          ) : subs.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No spaces"
              description="Space billing arrangements will appear here once spaces exist."
            />
          ) : (
            <ul className="divide-y divide-border">
              {subs.map((s) => (
                <li key={s.spaceId}>
                  <button
                    onClick={() => setSelected(s)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground">
                          {spaceSubName(s)}
                        </p>
                        <Badge variant={modelBadgeVariant(s.billingModel)}>
                          <ModelIcon model={s.billingModel} />
                          {s.billingModel
                            ? BILLING_MODEL_LABEL[s.billingModel]
                            : "Not set"}
                        </Badge>
                        {s.inherited && (
                          <Badge variant="warning">Inherited</Badge>
                        )}
                        {s.configured && !s.isActive && (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {spaceAdminName(s) && (
                          <span>Admin: {spaceAdminName(s)}</span>
                        )}
                        {spaceAdminEmail(s) && <span>{spaceAdminEmail(s)}</span>}
                        <span>{billingSummary(s)}</span>
                        <span>{s.eventsThisMonth} events this month</span>
                      </div>
                    </div>
                    <CaretLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit a space's arrangement                                                 */
/* -------------------------------------------------------------------------- */

function EditArrangement({
  sub,
  onBack,
  onSaved,
}: {
  sub: SpaceSubscription;
  onBack: () => void;
  onSaved: (updated: SpaceSubscription) => void;
}) {
  const [model, setModel] = useState<BillingModel>(
    sub.billingModel ?? "SUBSCRIPTION"
  );
  const [plan, setPlan] = useState<OrgPlan>(sub.plan ?? "STARTER");
  const [cycle, setCycle] = useState<BillingCycle>(sub.billingCycle);
  const [amount, setAmount] = useState(String(Number(sub.amount) || 0));
  const [pct, setPct] = useState(
    sub.revenueSharePercent != null ? String(Number(sub.revenueSharePercent)) : ""
  );
  const [isActive, setIsActive] = useState(sub.isActive);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    const input: AdminUpdateSubscriptionInput = {
      billingModel: model,
      isActive,
      reason: reason.trim() || undefined,
    };
    if (model === "REVENUE_SHARE") {
      input.revenueSharePercent = Number(pct) || 0;
    }
    if (model === "SUBSCRIPTION") {
      input.plan = plan;
      input.billingCycle = cycle;
      input.amount = Number(amount) || 0;
    }
    const { data, error } = await adminUpdateSpaceSubscription(sub.spaceId, input);
    setSaving(false);
    if (error || !data) {
      setError(error?.message || "Could not update the arrangement.");
      return;
    }
    onSaved(data);
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
        <CaretLeft className="h-4 w-4" /> Back to subscriptions
      </Button>

      <PageHeader
        title={spaceSubName(sub)}
        subtitle={
          spaceAdminName(sub)
            ? `Admin: ${spaceAdminName(sub)}${
                spaceAdminEmail(sub) ? ` · ${spaceAdminEmail(sub)}` : ""
              }`
            : spaceAdminEmail(sub) ?? undefined
        }
      />

      {error && <ErrorNotice message={error} />}

      {sub.inherited && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          This space still inherits its creator&rsquo;s legacy arrangement.
          Saving creates a dedicated arrangement for this space.
        </div>
      )}

      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Billing arrangement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select
              value={model}
              onValueChange={(v) => setModel(v as BillingModel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {BILLING_MODEL_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {model === "FREE" &&
                "No platform fee and no subscription charge."}
              {model === "REVENUE_SHARE" &&
                "Partnership: the platform keeps a percentage of this space's event sales."}
              {model === "SUBSCRIPTION" &&
                "A recurring plan fee. Choose the plan and cycle below."}
            </p>
          </div>

          {model === "REVENUE_SHARE" && (
            <div className="space-y-1.5">
              <Label htmlFor="pct">Platform cut (%)</Label>
              <div className="relative w-40">
                <Input
                  id="pct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  placeholder="8"
                  className="pr-8"
                />
                <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          )}

          {model === "SUBSCRIPTION" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={(v) => setPlan(v as OrgPlan)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLANS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLAN_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cycle</Label>
                <Select
                  value={cycle}
                  onValueChange={(v) => setCycle(v as BillingCycle)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {BILLING_CYCLE_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amt">Amount (₹)</Label>
                <Input
                  id="amt"
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="499"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive suspends this space&rsquo;s billing arrangement.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              className={
                "relative h-6 w-11 rounded-full transition-colors " +
                (isActive ? "bg-primary" : "bg-muted")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform " +
                  (isActive ? "left-0.5 translate-x-5" : "left-0.5")
                }
              />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Note (optional)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this changing? (logged in history)"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">
              Currently: {billingSummary(sub)}
            </span>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                "Saving…"
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" weight="fill" /> Save
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
