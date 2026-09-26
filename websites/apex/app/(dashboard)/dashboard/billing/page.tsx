"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Gift,
  Percent,
  Crown,
  CheckCircle,
  XCircle,
  Lightning,
} from "@phosphor-icons/react";
import { useSession } from "@/lib/context/SessionContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMySubscription,
  getMyUsage,
  getAllPlans,
  getBillingModels,
  getAppProcessingFeePercent,
  billingSummary,
  BILLING_MODEL_LABEL,
  PLAN_LABEL,
  type Subscription,
  type SubscriptionUsage,
  type PlanInfo,
  type BillingModelConfig,
  type BillingModel,
} from "@/lib/api/subscriptions-api";
import { createTicket } from "@/lib/api/support-api";

function ModelIcon({ model }: { model: BillingModel | null }) {
  const cls = "h-5 w-5";
  if (model === "FREE") return <Gift className={cls} weight="duotone" />;
  if (model === "REVENUE_SHARE")
    return <Percent className={cls} weight="duotone" />;
  return <Crown className={cls} weight="duotone" />;
}

function fmtLimit(n: number | null): string {
  return n === null ? "Unlimited" : String(n);
}

/** Usage row with a progress bar; null limit = unlimited. */
function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const pct =
    limit === null || limit === 0
      ? 0
      : Math.min(100, Math.round((used / limit) * 100));
  const near = limit !== null && pct >= 80;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">
          {used} <span className="text-muted-foreground">/ {fmtLimit(limit)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        {limit !== null && (
          <div
            className={
              "h-full rounded-full transition-all " +
              (near ? "bg-warning" : "bg-primary")
            }
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

/** What actually applies to this organiser, honouring their billing model. */
interface EffectiveConfig {
  title: string;
  attendeesPerEvent: number | null;
  ticketTypes: number | null;
  coCurators: number | null;
  processingFeePercent: number;
  hasWaitlist: boolean;
  hasBulkExport: boolean;
  hasAnalytics: boolean;
  hasWhatsappBlast: boolean;
  hasRecurringEvents: boolean;
  hasRemoveBranding: boolean;
  hasPrioritySupport: boolean;
}

const FEATURES: { key: keyof EffectiveConfig; label: string }[] = [
  { key: "hasWaitlist", label: "Waitlists" },
  { key: "hasBulkExport", label: "Bulk export" },
  { key: "hasAnalytics", label: "Analytics" },
  { key: "hasWhatsappBlast", label: "WhatsApp blasts" },
  { key: "hasRecurringEvents", label: "Recurring events" },
  { key: "hasRemoveBranding", label: "Remove Unifesto branding" },
  { key: "hasPrioritySupport", label: "Priority support" },
];

/**
 * Organiser-facing billing. Read-only: arrangements (free / revenue-share /
 * subscription) are set by platform staff. Shows the current arrangement,
 * usage against limits, and what the plan includes. Changes go through Support.
 */
export default function BillingPage() {
  const { role } = useSession();
  const isOrganiser = role === "space_admin";

  const [sub, setSub] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [models, setModels] = useState<BillingModelConfig[]>([]);
  // The fixed app-wide processing fee that attendees actually pay. Sourced from
  // the platform constant so what a subscription plan displays can never drift
  // from what's charged, even though the per-plan value stays admin-editable.
  const [appFeePct, setAppFeePct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [s, u, p, m, f] = await Promise.all([
      getMySubscription(),
      getMyUsage(),
      getAllPlans(),
      getBillingModels(),
      getAppProcessingFeePercent(),
    ]);
    if (s.error) setError(s.error.message || "Could not load your billing.");
    setSub(s.data);
    setUsage(u.data);
    setPlans(p.data ?? []);
    setModels(m.data ?? []);
    setAppFeePct(f.data?.processingFeePercent ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOrganiser) load();
  }, [isOrganiser, load]);

  // The definition that actually applies — from the plan for SUBSCRIPTION, or
  // the Free / Revenue-share model config otherwise.
  const effective = useMemo<EffectiveConfig | null>(() => {
    if (!sub) return null;
    const feats = (c: {
      hasWaitlist: boolean;
      hasBulkExport: boolean;
      hasAnalytics: boolean;
      hasWhatsappBlast: boolean;
      hasRecurringEvents: boolean;
      hasRemoveBranding: boolean;
      hasPrioritySupport: boolean;
    }) => ({
      hasWaitlist: c.hasWaitlist,
      hasBulkExport: c.hasBulkExport,
      hasAnalytics: c.hasAnalytics,
      hasWhatsappBlast: c.hasWhatsappBlast,
      hasRecurringEvents: c.hasRecurringEvents,
      hasRemoveBranding: c.hasRemoveBranding,
      hasPrioritySupport: c.hasPrioritySupport,
    });

    if (sub.billingModel === "SUBSCRIPTION") {
      const p = plans.find((x) => x.plan === sub.plan);
      if (!p) return null;
      return {
        title: sub.plan ? PLAN_LABEL[sub.plan] : "your plan",
        attendeesPerEvent: p.attendeesPerEvent,
        ticketTypes: p.ticketTypes,
        coCurators: p.coCurators,
        // Display the fixed app-wide fee (what's actually charged), falling back
        // to the plan's stored value only if the platform config didn't load.
        processingFeePercent: appFeePct ?? p.processingFeePercent,
        ...feats(p),
      };
    }

    const m = models.find((x) => x.billingModel === sub.billingModel);
    if (!m) return null;
    const fee =
      sub.billingModel === "REVENUE_SHARE"
        ? Number(sub.revenueSharePercent ?? m.defaultRevenueSharePercent ?? 0)
        : 0;
    return {
      title: sub.billingModel === "FREE" ? "Free" : "Revenue share",
      attendeesPerEvent: m.attendeesPerEvent,
      ticketTypes: m.ticketTypes,
      coCurators: m.coCurators,
      processingFeePercent: fee,
      ...feats(m),
    };
  }, [sub, plans, models, appFeePct]);

  if (!isOrganiser) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plan & Billing" />
        <EmptyState
          icon={CreditCard}
          title="Nothing to bill"
          description="Billing arrangements belong to organiser accounts. Admins manage all arrangements under Subscriptions."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan & Billing"
        subtitle="Your billing arrangement with Unifesto"
      />

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-40 lg:col-span-2" />
          <Skeleton className="h-40" />
        </div>
      ) : !sub ? (
        <EmptyState
          icon={CreditCard}
          title="No billing set up yet"
          description="Your arrangement will appear here once your space is approved."
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Current arrangement */}
            <Card className="lg:col-span-2">
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary">
                    <ModelIcon model={sub.billingModel} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground">
                        {sub.billingModel === "SUBSCRIPTION"
                          ? sub.plan
                            ? PLAN_LABEL[sub.plan]
                            : "Subscription"
                          : sub.billingModel
                            ? BILLING_MODEL_LABEL[sub.billingModel]
                            : "No arrangement"}
                      </h2>
                      <Badge variant={sub.isActive ? "success" : "destructive"}>
                        {sub.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {billingSummary(sub)}
                    </p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {sub.billingModel === "SUBSCRIPTION" && sub.nextPaymentAt && (
                    <p>
                      Renews{" "}
                      {new Date(sub.nextPaymentAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  {sub.billingModel === "REVENUE_SHARE" && (
                    <p>Deducted automatically from settlements.</p>
                  )}
                  {sub.billingModel === "FREE" && (
                    <p>You&apos;re on the house — enjoy 🎉</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Usage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">This month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {usage ? (
                  <>
                    <UsageMeter
                      label="Events"
                      used={usage.eventsThisMonth}
                      limit={usage.limits.eventsPerMonth}
                    />
                    <UsageMeter
                      label="Spaces"
                      used={usage.spacesCount}
                      limit={usage.limits.spaces}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Usage unavailable.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* What's included */}
          {effective && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  What {effective.title} includes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <LimitTile
                    label="Attendees / event"
                    value={fmtLimit(effective.attendeesPerEvent)}
                  />
                  <LimitTile
                    label="Ticket types"
                    value={fmtLimit(effective.ticketTypes)}
                  />
                  <LimitTile
                    label="Co-Curators"
                    value={fmtLimit(effective.coCurators)}
                  />
                  <LimitTile
                    label="Processing fee"
                    value={`${effective.processingFeePercent}%`}
                  />
                </div>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {FEATURES.map((f) => {
                    const on = Boolean(effective[f.key]);
                    return (
                      <div
                        key={f.key}
                        className="flex items-center gap-2 text-sm"
                      >
                        {on ? (
                          <CheckCircle
                            className="h-4 w-4 text-success"
                            weight="fill"
                          />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span
                          className={
                            on ? "text-foreground" : "text-muted-foreground"
                          }
                        >
                          {f.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Request a change */}
          <RequestChangeCard sub={sub} />
        </>
      )}
    </div>
  );
}

const CHANGE_OPTIONS = [
  "Upgrade my plan",
  "Downgrade my plan",
  "Switch to revenue-share",
  "Switch to a subscription plan",
  "Move to free",
  "Cancel / pause billing",
  "Something else",
];

/**
 * Lets an organiser request a billing change. Files a support ticket (category
 * Payments) that admins pick up in the Support queue and action in
 * Subscriptions — arrangements aren't self-serve.
 */
function RequestChangeCard({ sub }: { sub: Subscription }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(CHANGE_OPTIONS[0]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    const { data, error } = await createTicket({
      subject: `Billing change request: ${kind}`,
      category: "PAYMENTS",
      message:
        `Requested: ${kind}\n` +
        `Current arrangement: ${billingSummary(sub)}\n\n` +
        (message.trim() || "(no additional details)"),
    });
    setSubmitting(false);
    if (error || !data) {
      setError(error?.message || "Could not send your request.");
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center">
          <CheckCircle
            className="h-6 w-6 shrink-0 text-success"
            weight="fill"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Request sent</p>
            <p className="text-sm text-muted-foreground">
              Our team will follow up. You can track it under Support.
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/dashboard/support">View in Support</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Lightning
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              weight="duotone"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Need a different arrangement?
              </p>
              <p className="text-sm text-muted-foreground">
                Plan changes, revenue-share terms, and upgrades are handled by
                our team — tell us what you need.
              </p>
            </div>
          </div>
          {!open && (
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => setOpen(true)}
            >
              Request a change
            </Button>
          )}
        </div>

        {open && (
          <div className="space-y-4 border-t border-border pt-4">
            {error && <ErrorNotice message={error} />}
            <div className="space-y-1.5">
              <Label>What would you like?</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANGE_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-msg">Details (optional)</Label>
              <Textarea
                id="req-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Anything we should know — target plan, timeline, budget…"
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Sending…" : "Send request"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LimitTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
