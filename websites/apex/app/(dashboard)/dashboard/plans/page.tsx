"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle,
  ArrowCounterClockwise,
  Percent,
  CalendarX,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import {
  getPlanCatalog,
  getSpaceBillingStats,
  updatePlan,
  getPlatformConfig,
  updatePlatformConfig,
  PLAN_LABEL,
  type PlanInfo,
  type PlanCatalog,
  type PlanFeatureFlag,
  type OrgPlan,
} from "@/lib/api/subscriptions-api";

/** Every number a plan carries; an empty input means unlimited (or Custom for prices). */
const NUM_FIELDS = [
  "monthlyPrice",
  "annualPrice",
  "platformFeePercent",
  "spaces",
  "eventsPerMonth",
  "attendeesPerEvent",
  "ticketTypes",
  "coCurators",
] as const;
type NumField = (typeof NUM_FIELDS)[number];

type Draft = { nums: Record<NumField, string>; flags: Partial<Record<PlanFeatureFlag, boolean>> };

function toDraft(p: PlanInfo, flags: PlanFeatureFlag[]): Draft {
  return {
    nums: Object.fromEntries(
      NUM_FIELDS.map((k) => [k, p[k] == null ? "" : String(p[k])])
    ) as Record<NumField, string>,
    flags: Object.fromEntries(flags.map((f) => [f, p[f]])),
  };
}

function toPatch(d: Draft) {
  const whole = (raw: string) => (raw.trim() === "" ? null : Math.max(0, Math.trunc(Number(raw) || 0)));
  const patch: Record<string, unknown> = { ...d.flags };
  for (const k of NUM_FIELDS) patch[k] = whole(d.nums[k]);
  patch.platformFeePercent = Math.min(100, Math.max(0, Number(d.nums.platformFeePercent) || 0));
  return patch;
}

/**
 * Admin: every plan side by side. Price, organiser fee, limits and each
 * feature switch are edited in place and saved together; rows marked "every
 * plan" come from the backend catalog and aren't switchable. Saved values
 * drive display and enforcement via the backend PlanConfigService, for new
 * sales only (each sale keeps the fee it was sold at).
 */
export default function PlansPage() {
  const [data, setData] = useState<PlanCatalog | null>(null);
  const [counts, setCounts] = useState<Partial<Record<OrgPlan, number>>>({});
  const [saved, setSaved] = useState<Partial<Record<OrgPlan, Draft>>>({});
  const [draft, setDraft] = useState<Partial<Record<OrgPlan, Draft>>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const flags = useMemo(
    () => [...new Set((data?.catalog ?? []).flatMap((g) => g.rows.flatMap((r) => (r.flag ? [r.flag] : []))))],
    [data]
  );

  const load = useCallback(async () => {
    setError("");
    const [cat, stats] = await Promise.all([getPlanCatalog(), getSpaceBillingStats()]);
    if (cat.error || !cat.data) {
      setError(cat.error?.message || "Could not load plans.");
      return;
    }
    const f = [...new Set(cat.data.catalog.flatMap((g) => g.rows.flatMap((r) => (r.flag ? [r.flag] : []))))];
    const drafts = Object.fromEntries(cat.data.plans.map((p) => [p.plan, toDraft(p, f)]));
    setData(cat.data);
    setSaved(drafts);
    setDraft(structuredClone(drafts));
    if (stats.data) setCounts(stats.data.byPlan);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plans = data?.plans ?? [];
  const dirty = plans.filter((p) => JSON.stringify(draft[p.plan]) !== JSON.stringify(saved[p.plan]));

  const setNum = (plan: OrgPlan, k: NumField, v: string) =>
    setDraft((d) => ({ ...d, [plan]: { ...d[plan]!, nums: { ...d[plan]!.nums, [k]: v } } }));
  const toggle = (plan: OrgPlan, f: PlanFeatureFlag) =>
    setDraft((d) => ({ ...d, [plan]: { ...d[plan]!, flags: { ...d[plan]!.flags, [f]: !d[plan]!.flags[f] } } }));

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    for (const p of dirty) {
      const res = await updatePlan(p.plan, toPatch(draft[p.plan]!));
      if (res.error) {
        setError(`${PLAN_LABEL[p.plan]}: ${res.error.message || "could not save"}`);
        setSaving(false);
        await load();
        return;
      }
    }
    setNotice(`Saved ${dirty.map((p) => PLAN_LABEL[p.plan]).join(", ")}.`);
    setSaving(false);
    await load();
  };

  return (
    <div className={cn("space-y-6", dirty.length > 0 && "pb-24")}>
      <PageHeader
        title="Plans"
        subtitle="What each plan costs and includes. Edits apply to every space on the plan, for new sales only."
      />

      {error && <ErrorNotice message={error} />}
      {notice && (
        <p className="rounded-lg border border-success/25 bg-success-soft px-4 py-3 text-sm text-success">{notice}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <BuyerFeeCard />
        <PostEventWindowCard />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {!data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-72 border-b border-border bg-card px-4 py-4 text-left align-bottom text-xs font-medium text-muted-foreground">
                      {plans.length} plans
                    </th>
                    {plans.map((p) => (
                      <th
                        key={p.plan}
                        className={cn(
                          "border-b border-border px-3 py-4 text-left align-bottom font-normal",
                          dirty.some((d) => d.plan === p.plan) && "bg-warning-soft"
                        )}
                      >
                        <span className="block font-medium text-foreground">{PLAN_LABEL[p.plan]}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{p.tagline}</span>
                        <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                          {counts[p.plan] ?? 0} {counts[p.plan] === 1 ? "space" : "spaces"}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <GroupRow label="Price" span={plans.length + 1} />
                  <NumRow label="Monthly (₹)" hint="Empty = Custom" field="monthlyPrice" plans={plans} draft={draft} onChange={setNum} />
                  <NumRow label="Yearly (₹)" hint="Empty = Custom" field="annualPrice" plans={plans} draft={draft} onChange={setNum} />
                  <NumRow
                    label="Organiser fee per paid ticket (%)"
                    hint="New sales only. Separate from the buyer fee."
                    field="platformFeePercent"
                    step="0.25"
                    plans={plans}
                    draft={draft}
                    onChange={setNum}
                  />
                  {data.catalog.map((g) => (
                    <Fragment key={g.group}>
                      <GroupRow label={g.group} span={plans.length + 1} />
                      {g.rows.map((r) =>
                        r.limit ? (
                          <NumRow
                            key={r.label}
                            label={r.label}
                            hint="Empty = unlimited"
                            field={r.limit}
                            plans={plans}
                            draft={draft}
                            onChange={setNum}
                          />
                        ) : (
                          <tr key={r.label} className="hover:bg-muted/30">
                            <RowLabel label={r.label} hint={r.flag ? undefined : "Every plan"} />
                            {plans.map((p) => (
                              <td key={p.plan} className="border-b border-border px-3 py-2">
                                {r.flag ? (
                                  <Switch
                                    on={!!draft[p.plan]?.flags[r.flag]}
                                    label={`${r.label} on ${PLAN_LABEL[p.plan]}`}
                                    onClick={() => toggle(p.plan, r.flag!)}
                                  />
                                ) : (
                                  <Check className="h-4 w-4 text-muted-foreground" weight="bold" aria-label="Included" />
                                )}
                              </td>
                            ))}
                          </tr>
                        )
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Every space is on one of these plans. Custom terms for one space or event (a price, a fee, a comp) are deals,
        set from the space in Apex. {flags.length} feature switches, edited here, gate what spaces can use.
      </p>

      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              Unsaved changes to {dirty.map((p) => PLAN_LABEL[p.plan]).join(", ")}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => setDraft(structuredClone(saved))}>
                <ArrowCounterClockwise className="h-4 w-4" /> Discard
              </Button>
              <Button size="sm" disabled={saving} onClick={save}>
                <CheckCircle className="h-4 w-4" weight="fill" /> {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <th colSpan={span} className="border-b border-border bg-muted/40 px-4 py-2 text-left">
        <span className="text-eyebrow">{label}</span>
      </th>
    </tr>
  );
}

function RowLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <th scope="row" className="sticky left-0 z-10 border-b border-border bg-card px-4 py-2 text-left font-normal">
      <span className="text-foreground">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </th>
  );
}

function NumRow({
  label,
  hint,
  field,
  step = "1",
  plans,
  draft,
  onChange,
}: {
  label: string;
  hint?: string;
  field: NumField;
  step?: string;
  plans: PlanInfo[];
  draft: Partial<Record<OrgPlan, Draft>>;
  onChange: (plan: OrgPlan, k: NumField, v: string) => void;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <RowLabel label={label} hint={hint} />
      {plans.map((p) => (
        <td key={p.plan} className="border-b border-border px-3 py-1.5">
          <Input
            type="number"
            min={0}
            step={step}
            inputMode="decimal"
            placeholder={field === "monthlyPrice" || field === "annualPrice" ? "Custom" : "∞"}
            aria-label={`${label}, ${PLAN_LABEL[p.plan]}`}
            value={draft[p.plan]?.nums[field] ?? ""}
            onChange={(e) => onChange(p.plan, field, e.target.value)}
            className="h-8 w-28 tabular-nums"
          />
        </td>
      ))}
    </tr>
  );
}

function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform",
          on && "translate-x-4"
        )}
      />
    </button>
  );
}

/**
 * The buyer fee: a fixed percentage the attendee pays on top of the ticket
 * price on every paid registration. Fixed platform-wide (PROCESSING_FEE_PERCENT
 * on the backend) so the shown total and the charge never drift. Separate from
 * the organiser fee each plan sets.
 */
function BuyerFeeCard() {
  const [pct, setPct] = useState<number | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPlatformConfig().then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else if (data) {
        setPct(data.processingFeePercent);
        setCap(data.processingFeeCapPerTicket ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
          <Percent className="h-4 w-4" weight="duotone" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">Buyer fee</p>
          {error ? (
            <ErrorNotice message={error} />
          ) : pct === null ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <p className="font-display text-2xl tabular-nums text-foreground">
              {pct}%
              {cap ? <span className="block font-sans text-sm text-muted-foreground">Capped at ₹{cap} a ticket</span> : null}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Paid by attendees on top of the ticket price, on every plan. Fixed platform-wide.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * How many days after an event ends its organisers may still issue
 * certificates and import or add attendees. 0 closes them the moment the
 * event ends.
 */
function PostEventWindowCard() {
  const [value, setValue] = useState("");
  const [savedDays, setSavedDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPlatformConfig().then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else if (data) {
        setValue(String(data.postEventActionWindowDays));
        setSavedDays(data.postEventActionWindowDays);
      }
    });
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
    const { data, error } = await updatePlatformConfig({ postEventActionWindowDays: days });
    if (error) setError(error.message);
    else if (data) setSavedDays(data.postEventActionWindowDays);
    setSaving(false);
  };

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
          <CalendarX className="h-4 w-4" weight="duotone" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">Post-event window</p>
          {error && <ErrorNotice message={error} />}
          {savedDays === null && !error ? (
            <Skeleton className="h-9 w-40" />
          ) : (
            <div className="flex items-center gap-2">
              <Label htmlFor="post-event-window" className="sr-only">
                Days after an event ends
              </Label>
              <Input
                id="post-event-window"
                type="number"
                min={0}
                max={365}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 w-20 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">days</span>
              <Button size="sm" variant="outline" onClick={save} disabled={saving || Number(value) === savedDays}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            After an event ends, how long organisers can still issue certificates and add attendees. 0 closes them at
            once.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
