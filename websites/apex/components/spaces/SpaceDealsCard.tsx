"use client";

import { cloneElement, useCallback, useEffect, useId, useState, type ReactElement } from "react";
import {
  createSpaceDeal,
  endDeal,
  getSpaceDeals,
  SELLABLE_PLANS,
  type BillingCycle,
  type Deal,
  type OrgPlan,
  type ResolvedTerms,
} from "@/lib/api/subscriptions-api";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Until 5.0.0 (2 Dec 2026) the old 4.0.5 app shows a 5% fee estimate while
 * Razorpay charges the server amount, so a deal with another buyer fee shows
 * those buyers a wrong estimate.
 */
const OLD_APP_CUTOFF = new Date("2026-12-02T00:00:00+05:30");
const oldAppWarning = (buyerFeeBps: number | null | undefined) =>
  buyerFeeBps != null && buyerFeeBps !== 500 && Date.now() < OLD_APP_CUTOFF.getTime();

const pct = (bps: number | null) => (bps == null ? "rate card" : `${bps / 100}%`);
const rupees = (paise: number | null) =>
  paise == null ? "rate card" : paise === 0 ? "comp" : `₹${(paise / 100).toLocaleString("en-IN")}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Empty input = null (rate card); otherwise a number. */
const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** Platform admin: list, create and end a space's deals (T4). */
export function SpaceDealsCard({ spaceId }: { spaceId: string }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [current, setCurrent] = useState<ResolvedTerms | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    eventId: "",
    plan: "" as OrgPlan | "",
    billingCycle: "" as BillingCycle | "",
    planPrice: "",
    buyerFee: "",
    organiserFee: "",
    validUntil: "",
    note: "",
  });

  const load = useCallback(async () => {
    const { data, error } = await getSpaceDeals(spaceId);
    if (error) return setError(error.message || "Could not load deals.");
    setDeals(data?.deals ?? []);
    setCurrent(data?.current ?? null);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const buyerFeeBps = num(form.buyerFee) == null ? null : Math.round(num(form.buyerFee)! * 100);

  const create = async () => {
    setSaving(true);
    setError("");
    const planPrice = num(form.planPrice);
    const organiserFee = num(form.organiserFee);
    const { error } = await createSpaceDeal(spaceId, {
      eventId: form.eventId.trim() || undefined,
      plan: form.plan || undefined,
      billingCycle: form.billingCycle || undefined,
      planPricePaise: planPrice == null ? undefined : Math.round(planPrice * 100),
      buyerFeeBps: buyerFeeBps ?? undefined,
      organiserFeeBps: organiserFee == null ? undefined : Math.round(organiserFee * 100),
      validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
      note: form.note.trim() || undefined,
    });
    setSaving(false);
    if (error) return setError(error.message || "Could not create the deal.");
    setOpen(false);
    setForm({ eventId: "", plan: "", billingCycle: "", planPrice: "", buyerFee: "", organiserFee: "", validUntil: "", note: "" });
    void load();
  };

  const end = async (deal: Deal) => {
    const ok = await confirmDialog({
      title: "End this deal?",
      description: "New sales go back to the rate card now. Sales it already priced keep their terms.",
      confirmLabel: "End deal",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await endDeal(deal.id);
    if (error) return setError(error.message || "Could not end the deal.");
    void load();
  };

  const now = Date.now();
  const isActive = (d: Deal) =>
    new Date(d.validFrom).getTime() <= now && (!d.validUntil || new Date(d.validUntil).getTime() > now);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deals</CardTitle>
        <CardDescription>
          Negotiated terms. An event deal beats a space deal; blank fields use the rate card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorNotice message={error} />}
        {current && (
          <p className="text-sm text-muted-foreground">
            Now: {current.plan}, buyer fee {pct(current.buyerFeeBps)}, organiser fee{" "}
            {pct(current.organiserFeeBps)}
            {current.dealId ? " (space deal)" : " (rate card)"}
          </p>
        )}
        {oldAppWarning(current?.buyerFeeBps) && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            Buyer fee isn&apos;t 5%: the old 4.0.5 app shows a 5% estimate until 2 Dec, while
            Razorpay charges the real amount.
          </p>
        )}

        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deals. This space pays the rate card.</p>
        ) : (
          <ul className="space-y-2">
            {deals.map((d) => (
              <li key={d.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.event ? d.event.title : "Whole space"}</span>
                  {isActive(d) ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Ended</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.plan ?? "Plan: rate card"} · price {rupees(d.planPricePaise)}
                  {d.billingCycle ? ` ${d.billingCycle.toLowerCase()}` : ""} · buyer {pct(d.buyerFeeBps)} ·
                  organiser {pct(d.organiserFeeBps)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {day(d.validFrom)} → {d.validUntil ? day(d.validUntil) : "open-ended"}
                  {d.note ? ` · ${d.note}` : ""}
                </div>
                {isActive(d) && oldAppWarning(d.buyerFeeBps) && (
                  <div className="text-xs text-amber-600">Buyer fee isn&apos;t 5%: old-app estimate is off until 2 Dec.</div>
                )}
                {(!d.validUntil || new Date(d.validUntil).getTime() > now) && (
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => end(d)}>
                    End now
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            New deal
          </Button>
        ) : (
          <div className="space-y-2 rounded-md border p-3">
            <Field label="Event ID (blank = whole space)">
              <Input value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Plan">
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value as OrgPlan | "" })}
                >
                  <option value="">Rate card</option>
                  {SELLABLE_PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cycle">
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={form.billingCycle}
                  onChange={(e) => setForm({ ...form, billingCycle: e.target.value as BillingCycle | "" })}
                >
                  <option value="">Any</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </Field>
              <Field label="Plan price ₹ (0 = comp)">
                <Input inputMode="decimal" value={form.planPrice} onChange={(e) => setForm({ ...form, planPrice: e.target.value })} />
              </Field>
              <Field label="Buyer fee %">
                <Input inputMode="decimal" value={form.buyerFee} onChange={(e) => setForm({ ...form, buyerFee: e.target.value })} />
              </Field>
              <Field label="Organiser fee %">
                <Input inputMode="decimal" value={form.organiserFee} onChange={(e) => setForm({ ...form, organiserFee: e.target.value })} />
              </Field>
              <Field label="Ends (blank = open)">
                <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </Field>
            </div>
            <Field label="Note">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            {oldAppWarning(buyerFeeBps) && (
              <p className="text-xs text-amber-600">
                Buyer fee isn&apos;t 5%: the old 4.0.5 app will show buyers a 5% estimate until 2 Dec.
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={create} disabled={saving}>
                {saving ? "Saving…" : "Create deal"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {cloneElement(children, { id })}
    </div>
  );
}
