"use client";

import { inr } from "@/console/lib/utils/money";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Percent, Plus, Trash, PencilSimple, Tag } from "@unifesto/unicon/react";
import { Field } from "@/console/components/hackathon/HackParts";
import {
  getEventCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  type Coupon,
  type CouponInput,
  type CouponDiscountType,
} from "@/console/lib/api/coupons-api";
import { getEventById, type Event } from "@/console/lib/api/events-api";
import { EventExportMenu } from "@/console/components/shared/EventExportMenu";
import { matches, Pager, SearchBox, usePaged } from "@/console/components/shared/ListControls";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";

// ---- Draft shape: every field a string so the form inputs stay controlled ----
interface Draft {
  id?: string;
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: string;
  maxDiscountAmount: string;
  minPurchaseAmount: string;
  usageLimit: string;
  perUserLimit: string;
  startsAt: string;
  expiresAt: string;
  appliesToTicketTypeIds: string[];
  isActive: boolean;
}

const EMPTY_DRAFT: Draft = {
  code: "",
  description: "",
  discountType: "PERCENT",
  discountValue: "",
  maxDiscountAmount: "",
  minPurchaseAmount: "",
  usageLimit: "",
  perUserLimit: "1",
  startsAt: "",
  expiresAt: "",
  appliesToTicketTypeIds: [],
  isActive: true,
};

/** An ISO string -> the value a <input type="datetime-local"> expects (local). */
function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** datetime-local value -> ISO string, or undefined when blank. */
function localToIso(local: string): string | undefined {
  if (!local.trim()) return undefined;
  return new Date(local).toISOString();
}

function toDraft(c: Coupon): Draft {
  return {
    id: c.id,
    code: c.code,
    description: c.description ?? "",
    discountType: c.discountType,
    discountValue: String(Number(c.discountValue)),
    maxDiscountAmount:
      c.maxDiscountAmount != null ? String(Number(c.maxDiscountAmount)) : "",
    minPurchaseAmount:
      c.minPurchaseAmount != null ? String(Number(c.minPurchaseAmount)) : "",
    usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
    perUserLimit: String(c.perUserLimit),
    startsAt: isoToLocal(c.startsAt),
    expiresAt: isoToLocal(c.expiresAt),
    appliesToTicketTypeIds: c.appliesToTicketTypeIds ?? [],
    isActive: c.isActive,
  };
}

export default function EventCouponsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [couponsRes, eventRes] = await Promise.all([
      getEventCoupons(eventId),
      getEventById(eventId),
    ]);
    if (couponsRes.error) setError(couponsRes.error.message);
    else setCoupons(couponsRes.data ?? []);
    if (eventRes.data) setEvent(eventRes.data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => coupons.filter((c) => matches(search, c.code, c.description)),
    [coupons, search]
  );
  const { page, setPage, totalPages, pageItems } = usePaged(shown);

  const paidTicketTypes = useMemo(
    () => (event?.ticketTypes ?? []).filter((t) => Number(t.price) > 0),
    [event]
  );

  const save = async () => {
    if (!draft) return;
    if (!draft.code.trim()) return setError("A code is required.");
    const value = Number(draft.discountValue);
    if (!value || value <= 0)
      return setError("Discount value must be greater than 0.");
    if (draft.discountType === "PERCENT" && value > 100)
      return setError("A percentage discount cannot exceed 100.");
    const startsAt = localToIso(draft.startsAt);
    const expiresAt = localToIso(draft.expiresAt);
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt))
      return setError("The end date must be after the start date.");

    // Blanks go as null so an edit clears them (undefined would keep the old value).
    const input: CouponInput = {
      code: draft.code.trim().toUpperCase(),
      description: draft.description.trim() || null,
      discountType: draft.discountType,
      discountValue: value,
      maxDiscountAmount:
        draft.discountType === "PERCENT" && draft.maxDiscountAmount.trim()
          ? Number(draft.maxDiscountAmount)
          : null,
      minPurchaseAmount: draft.minPurchaseAmount.trim()
        ? Number(draft.minPurchaseAmount)
        : null,
      usageLimit: draft.usageLimit.trim() ? Number(draft.usageLimit) : null,
      perUserLimit: Number(draft.perUserLimit) || 1,
      startsAt: startsAt ?? null,
      expiresAt: expiresAt ?? null,
      appliesToTicketTypeIds: draft.appliesToTicketTypeIds,
      isActive: draft.isActive,
    };

    setSaving(true);
    setError("");
    const { error } = draft.id
      ? await updateCoupon(eventId, draft.id, input)
      : await createCoupon(eventId, input);
    setSaving(false);
    if (error) return setError(error.message);
    setDraft(null);
    await load();
  };

  const remove = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.code}"?`)) return;
    const { error } = await deleteCoupon(eventId, c.id);
    if (error) setError(error.message);
    else await load();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discount codes"
        subtitle="Percentage or flat-amount codes buyers apply at checkout"
        actions={
          !draft ? (
            <div className="flex flex-wrap gap-2">
              <EventExportMenu eventId={eventId} type="coupons" />
              <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                <Plus className="h-4 w-4" weight="bold" />
                Add code
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && <ErrorNotice message={error} />}

      {draft && (
        <CouponForm
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={() => {
            setDraft(null);
            setError("");
          }}
          saving={saving}
          paidTicketTypes={paidTicketTypes.map((t) => ({
            id: t.id,
            name: t.name,
          }))}
        />
      )}

      {coupons.length === 0 && !draft ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Tag}
              tone="positive"
              title="No discount codes yet"
              description="Create a percentage or flat-amount code. Buyers type it at checkout and the discount comes off the ticket price before fees."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search codes"
          />
          {shown.length === 0 && (
            <p className="text-sm text-muted-foreground">No codes match “{search}”.</p>
          )}
          {pageItems.map((c) => (
            <CouponRow
              key={c.id}
              coupon={c}
              onEdit={() => {
                setError("");
                setDraft(toDraft(c));
                if (typeof window !== "undefined")
                  window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onDelete={() => remove(c)}
            />
          ))}
          <Pager page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CouponForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  paidTicketTypes,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  paidTicketTypes: { id: string; name: string }[];
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const isPercent = draft.discountType === "PERCENT";

  const toggleTicketType = (id: string) => {
    const has = draft.appliesToTicketTypeIds.includes(id);
    set({
      appliesToTicketTypeIds: has
        ? draft.appliesToTicketTypeIds.filter((x) => x !== id)
        : [...draft.appliesToTicketTypeIds, id],
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <h3 className="text-sm font-semibold text-foreground">
          {draft.id ? "Edit code" : "New code"}
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Buyers type this at checkout (any case)">
            <Input
              value={draft.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              placeholder="EARLYBIRD"
            />
          </Field>
          <Field label="Discount type">
            <Select
              value={draft.discountType}
              onValueChange={(v) =>
                set({ discountType: v as CouponDiscountType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENT">Percentage off</SelectItem>
                <SelectItem value="FLAT">Flat amount off</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Description (optional)">
          <Input
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="e.g. Early-bird, first 100 orders"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={isPercent ? "Percentage (%)" : "Amount off (₹)"}
            hint={isPercent ? "0 to 100" : undefined}
          >
            <Input
              type="number"
              inputMode="decimal"
              value={draft.discountValue}
              onChange={(e) => set({ discountValue: e.target.value })}
              placeholder={isPercent ? "20" : "200"}
            />
          </Field>
          {isPercent && (
            <Field label="Max discount (₹, optional)" hint="Cap the money taken off">
              <Input
                type="number"
                inputMode="decimal"
                value={draft.maxDiscountAmount}
                onChange={(e) => set({ maxDiscountAmount: e.target.value })}
                placeholder="500"
              />
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Min purchase (₹, optional)">
            <Input
              type="number"
              inputMode="decimal"
              value={draft.minPurchaseAmount}
              onChange={(e) => set({ minPurchaseAmount: e.target.value })}
              placeholder="1000"
            />
          </Field>
          <Field label="Total uses (optional)" hint="Blank = unlimited">
            <Input
              type="number"
              inputMode="numeric"
              value={draft.usageLimit}
              onChange={(e) => set({ usageLimit: e.target.value })}
              placeholder="100"
            />
          </Field>
          <Field label="Uses per person">
            <Input
              type="number"
              inputMode="numeric"
              value={draft.perUserLimit}
              onChange={(e) => set({ perUserLimit: e.target.value })}
              placeholder="1"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts (optional)">
            <Input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => set({ startsAt: e.target.value })}
            />
          </Field>
          <Field label="Expires (optional)">
            <Input
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(e) => set({ expiresAt: e.target.value })}
            />
          </Field>
        </div>

        {paidTicketTypes.length > 0 && (
          <Field
            label="Applies to"
            hint="Leave all unchecked to apply to every paid ticket"
          >
            <div className="flex flex-wrap gap-2">
              {paidTicketTypes.map((t) => {
                const on = draft.appliesToTicketTypeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTicketType(t.id)}
                    className={
                      "rounded-full border px-3 py-1 text-sm transition-colors " +
                      (on
                        ? "border-primary bg-primary-soft font-medium text-primary"
                        : "border-border text-muted-foreground hover:bg-muted")
                    }
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => set({ isActive: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          Active (buyers can use this code)
        </label>

        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : draft.id ? "Save changes" : "Create code"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CouponRow({
  coupon,
  onEdit,
  onDelete,
}: {
  coupon: Coupon;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const value = Number(coupon.discountValue);
  const discountLabel =
    coupon.discountType === "PERCENT"
      ? `${value}% off${
          coupon.maxDiscountAmount
            ? ` (max ${inr(coupon.maxDiscountAmount)})`
            : ""
        }`
      : `${inr(value)} off`;

  const expired =
    coupon.expiresAt != null && new Date(coupon.expiresAt) < new Date();
  const full =
    coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-foreground">
              {coupon.code}
            </span>
            <Badge variant="brand">
              <Percent className="mr-1 h-3 w-3" />
              {discountLabel}
            </Badge>
            {!coupon.isActive && <Badge variant="neutral">Inactive</Badge>}
            {expired && <Badge variant="warning">Expired</Badge>}
            {full && <Badge variant="warning">Fully used</Badge>}
          </div>
          {coupon.description && (
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
              {coupon.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {coupon.confirmedCount} redeemed
            {coupon.usageLimit != null
              ? ` · ${coupon.usedCount}/${coupon.usageLimit} used`
              : " · unlimited uses"}
            {` · ${coupon.perUserLimit} per person`}
            {coupon.minPurchaseAmount
              ? ` · min ${inr(coupon.minPurchaseAmount)}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label="Edit code"
          >
            <PencilSimple className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label="Delete code"
          >
            <Trash className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
