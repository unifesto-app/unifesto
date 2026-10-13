"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  ArrowClockwise,
  CaretLeft,
  Gift,
  Percent,
  Crown,
  PencilSimple,
  CalendarX,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAllPlans,
  getBillingModels,
  updatePlan,
  updateModel,
  getPlatformConfig,
  updatePlatformConfig,
  PLAN_LABEL,
  type PlanInfo,
  type BillingModelConfig,
  type OrgPlan,
} from "@/lib/api/subscriptions-api";

/* ------------------------------ shared fields ----------------------------- */

const LIMIT_FIELDS = [
  { key: "spaces", label: "Spaces" },
  { key: "eventsPerMonth", label: "Events / month" },
  { key: "attendeesPerEvent", label: "Attendees / event" },
  { key: "ticketTypes", label: "Ticket types" },
  { key: "coCurators", label: "Co-Curators" },
] as const;

const FEATURE_FIELDS = [
  { key: "hasWaitlist", label: "Waitlists" },
  { key: "hasBulkExport", label: "Bulk export" },
  { key: "hasAnalytics", label: "Analytics" },
  { key: "hasWhatsappBlast", label: "WhatsApp blasts" },
  { key: "hasRecurringEvents", label: "Recurring events" },
  { key: "hasRemoveBranding", label: "Remove branding" },
  { key: "hasPrioritySupport", label: "Priority support" },
  { key: "hasSessions", label: "Sessions" },
  { key: "hasCertificates", label: "Certificates" },
  { key: "hasSponsors", label: "Sponsors & leads" },
] as const;

/** A unified row for either a billing model (Free/%) or a subscription plan. */
type Row =
  | { kind: "model"; key: "FREE" | "REVENUE_SHARE"; name: string; data: BillingModelConfig }
  | { kind: "plan"; key: OrgPlan; name: string; data: PlanInfo };

function rowIcon(row: Row) {
  const cls = "h-4 w-4";
  if (row.kind === "model")
    return row.key === "FREE" ? (
      <Gift className={cls} weight="duotone" />
    ) : (
      <Percent className={cls} weight="duotone" />
    );
  return <Crown className={cls} weight="duotone" />;
}

function rowRate(row: Row): string {
  if (row.kind === "model") {
    if (row.key === "FREE") return "Free";
    const p = row.data.defaultRevenueSharePercent;
    return p == null ? "% of sales" : `${p}% of sales`;
  }
  const m = row.data.monthlyPrice;
  if (m == null) return "Custom";
  if (m === 0) return "Free";
  return `₹${m.toLocaleString("en-IN")}/mo`;
}

function num(n: number | null): string {
  return n == null ? "∞" : String(n);
}

function featureCount(data: PlanInfo | BillingModelConfig): number {
  return FEATURE_FIELDS.filter((f) => Boolean((data as never)[f.key])).length;
}

/**
 * Admin: define every billing option — the Free and Revenue-share models, and
 * the four subscription tiers. Saved values drive display *and* enforcement of
 * limits and features via the backend PlanConfigService. The revenue-share %
 * set here is what the payout service deducts from those organisers' sales.
 */
export default function PlansPage() {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [models, setModels] = useState<BillingModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [p, m] = await Promise.all([getAllPlans(), getBillingModels()]);
    if (p.error || m.error) {
      setError(p.error?.message || m.error?.message || "Could not load plans.");
    }
    setPlans(p.data ?? []);
    setModels(m.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows: Row[] = useMemo(() => {
    const modelRows: Row[] = models.map((data) => ({
      kind: "model",
      key: data.billingModel,
      name: data.billingModel === "FREE" ? "Free" : "Revenue share",
      data,
    }));
    const planRows: Row[] = plans.map((data) => ({
      kind: "plan",
      key: data.plan,
      name: PLAN_LABEL[data.plan],
      data,
    }));
    return [...modelRows, ...planRows];
  }, [models, plans]);

  if (selected) {
    return (
      <PlanEditor
        row={selected}
        onBack={() => setSelected(null)}
        onSaved={async () => {
          await load();
          setSelected(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans & billing models"
        subtitle="Define what Free, Revenue-share and each subscription plan include"
      />

      {error && <ErrorNotice message={error} />}

      <GlobalFeeCard />

      <PostEventWindowCard />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Option</th>
                    <th className="px-4 py-3 font-medium">Rate</th>
                    <th className="px-4 py-3 font-medium">Events/mo</th>
                    <th className="px-4 py-3 font-medium">Attendees</th>
                    <th className="px-4 py-3 font-medium">Features</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr
                      key={`${row.kind}-${row.key}`}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                      onClick={() => setSelected(row)}
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 place-items-center rounded-md bg-muted text-muted-foreground">
                            {rowIcon(row)}
                          </span>
                          <span className="font-medium text-foreground">
                            {row.name}
                          </span>
                          {row.kind === "model" && (
                            <Badge variant="brand">Model</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {rowRate(row)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {num(row.data.eventsPerMonth)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {num(row.data.attendeesPerEvent)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {featureCount(row.data)} / {FEATURE_FIELDS.length}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Button variant="ghost" size="sm">
                          <PencilSimple className="h-4 w-4" /> Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Platform fee (deducted from the organiser&apos;s sales): only
        revenue-share organisers pay it, at their set % — Free and
        subscription-plan organisers pay 0% (subscription plans pay monthly
        instead). This is separate from the app processing fee above, which
        attendees pay on top of the ticket price.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

function numToStr(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

function Toggle({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}) {
  return (
    <span
      className={
        "relative h-5 w-9 shrink-0 rounded-full transition-colors " +
        (on ? "bg-primary" : "bg-muted")
      }
    >
      <span
        className={
          "absolute top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform " +
          (on ? "left-0.5 translate-x-4" : "left-0.5")
        }
      />
    </span>
  );
}

function PlanEditor({
  row,
  onBack,
  onSaved,
}: {
  row: Row;
  onBack: () => void;
  onSaved: () => void;
}) {
  const data = row.data as unknown as Record<string, unknown>;
  const [nums, setNums] = useState<Record<string, string>>({});
  const [bools, setBools] = useState<Record<string, boolean>>({});
  // plan-only
  const [monthly, setMonthly] = useState("");
  const [annual, setAnnual] = useState("");
  // revenue-share only
  const [pct, setPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    const n: Record<string, string> = {};
    LIMIT_FIELDS.forEach((f) => {
      n[f.key] = numToStr(data[f.key] as number | null);
    });
    setNums(n);
    const b: Record<string, boolean> = {};
    FEATURE_FIELDS.forEach((f) => {
      b[f.key] = Boolean(data[f.key]);
    });
    setBools(b);
    if (row.kind === "plan") {
      setMonthly(numToStr(row.data.monthlyPrice));
      setAnnual(numToStr(row.data.annualPrice));
    } else if (row.key === "REVENUE_SHARE") {
      setPct(numToStr(row.data.defaultRevenueSharePercent));
    }
  }, [row, data]);

  useEffect(() => {
    reset();
  }, [reset]);

  const toInt = (raw: string): number | null =>
    raw === "" ? null : Math.max(0, Math.trunc(Number(raw) || 0));

  const save = async () => {
    setSaving(true);
    setError("");
    const patch: Record<string, unknown> = {};
    LIMIT_FIELDS.forEach((f) => {
      patch[f.key] = toInt(nums[f.key] ?? "");
    });
    FEATURE_FIELDS.forEach((f) => {
      patch[f.key] = bools[f.key];
    });

    let res;
    if (row.kind === "plan") {
      patch.monthlyPrice = toInt(monthly);
      patch.annualPrice = toInt(annual);
      res = await updatePlan(row.key, patch);
    } else {
      if (row.key === "REVENUE_SHARE") {
        patch.defaultRevenueSharePercent =
          pct === "" ? null : Math.min(100, Math.max(0, Number(pct) || 0));
      }
      res = await updateModel(row.key, patch);
    }
    setSaving(false);
    if (res.error) {
      setError(res.error.message || "Could not save.");
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
        <CaretLeft className="h-4 w-4" /> Back to plans
      </Button>

      <PageHeader
        title={row.name}
        subtitle={
          row.kind === "model"
            ? row.key === "FREE"
              ? "Free organisers — no platform fee"
              : "Revenue-share organisers — platform takes a % of sales"
            : "Subscription plan"
        }
      />

      {error && <ErrorNotice message={error} />}

      <Card className="max-w-3xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Definition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Rate / pricing */}
          {(row.kind === "plan" || row.key === "REVENUE_SHARE") && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.kind === "plan" ? "Pricing" : "Rate"}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {row.kind === "plan" ? (
                  <>
                    <Field label="Monthly ₹">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Custom"
                        value={monthly}
                        onChange={(e) => setMonthly(e.target.value)}
                        className="h-9"
                      />
                    </Field>
                    <Field label="Annual ₹">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Custom"
                        value={annual}
                        onChange={(e) => setAnnual(e.target.value)}
                        className="h-9"
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Default platform cut %">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      placeholder="8"
                      value={pct}
                      onChange={(e) => setPct(e.target.value)}
                      className="h-9"
                    />
                  </Field>
                )}
              </div>
            </div>
          )}

          {/* Limits */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Limits <span className="normal-case">(empty = unlimited)</span>
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {LIMIT_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="∞"
                    value={nums[f.key] ?? ""}
                    onChange={(e) =>
                      setNums((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                    className="h-9"
                  />
                </Field>
              ))}
            </div>
          </div>

          {/* Features */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Features
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FEATURE_FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="switch"
                  aria-checked={bools[f.key] ?? false}
                  onClick={() =>
                    setBools((p) => ({ ...p, [f.key]: !p[f.key] }))
                  }
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40"
                >
                  <span className="text-foreground">{f.label}</span>
                  <Toggle
                    on={bools[f.key] ?? false}
                    onClick={() => {}}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
              <ArrowClockwise className="h-4 w-4" /> Reset
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/**
 * App-wide processing fee — a fixed percentage the attendee pays on top of the
 * ticket price, on every paid registration across all events. Fixed platform-wide
 * (see PROCESSING_FEE_PERCENT on the backend) and no longer admin-editable, so
 * the displayed total and the amount charged can never drift apart. Separate
 * from the organiser-side platform fee (revenue share).
 */
function GlobalFeeCard() {
  const [pct, setPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await getPlatformConfig();
      if (cancelled) return;
      if (error) setError(error.message);
      else if (data) setPct(data.processingFeePercent);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-primary" weight="duotone" />
          App processing fee
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Added on top of the ticket price and paid by the attendee, on every
          paid registration across all events. This is separate from the
          platform fee below, which is deducted from the organiser&apos;s sales.
        </p>
        {error && <ErrorNotice message={error} />}
        {loading ? (
          <Skeleton className="h-10 w-48" />
        ) : (
          <div className="space-y-1">
            <div className="text-3xl font-semibold tabular-nums">{pct}%</div>
            <p className="text-xs text-muted-foreground">
              Fixed platform-wide — not editable.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * App-wide post-event action window — how many days after an event ends its
 * organisers may still issue certificates and import/add attendees. Once it
 * elapses those actions are refused across every event. 0 closes them the
 * moment the event ends.
 */
function PostEventWindowCard() {
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedDays, setSavedDays] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await getPlatformConfig();
      if (cancelled) return;
      if (error) setError(error.message);
      else if (data) {
        setValue(String(data.postEventActionWindowDays));
        setSavedDays(data.postEventActionWindowDays);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      setError("Enter a whole number of days between 0 and 365.");
      return;
    }
    setSaving(true);
    setError("");
    const { data, error } = await updatePlatformConfig({
      postEventActionWindowDays: days,
    });
    if (error) setError(error.message);
    else if (data) setSavedDays(data.postEventActionWindowDays);
    setSaving(false);
  };

  const dirty = savedDays !== null && Number(value) !== savedDays;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarX className="h-4 w-4 text-primary" weight="duotone" />
          Post-event action window
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          How many days after an event ends its organisers may still issue
          certificates and import or add attendees. After this, those actions
          are closed for the event. Set 0 to close them the moment the event
          ends.
        </p>
        {error && <ErrorNotice message={error} />}
        {loading ? (
          <Skeleton className="h-10 w-48" />
        ) : (
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="post-event-window">
                Window
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="post-event-window"
                  type="number"
                  min={0}
                  max={365}
                  step="1"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>
            <Button onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save window"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
