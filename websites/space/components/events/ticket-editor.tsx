"use client";

import {
  type EventTicketType,
  type TicketKind,
  type GroupPricingMode,
} from "@/lib/api/events-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/** Fields every attendee provides for any ticket, shown for reference. */
export const DEFAULT_FIELDS = ["Name", "Phone", "Email", "Gender"];

/**
 * `datetime-local` (browser local time) → ISO string. Empty stays empty.
 * Matches the conversion used by the event wizard so the two behave alike.
 */
export function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** ISO string → `datetime-local` value in the browser's local time. */
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Shift by the tz offset so the local wall-clock time survives into the input.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** Editable draft for a new/edited individual or group ticket. */
export interface Draft {
  id?: string;
  name: string;
  description: string;
  kind: Exclude<TicketKind, "RSVP">;
  price: string;
  groupPricingMode: GroupPricingMode;
  minGroupSize: string;
  maxGroupSize: string;
  capacity: string;
  perUserLimit: string;
  waitlistEnabled: boolean;
  waitlistOfferTtlHours: string;
  /** `datetime-local` values (browser local time); empty = no bound. */
  saleStartsAt: string;
  saleEndsAt: string;
}

export const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  kind: "INDIVIDUAL",
  price: "0",
  groupPricingMode: "PER_GROUP",
  minGroupSize: "2",
  maxGroupSize: "5",
  capacity: "",
  perUserLimit: "1",
  waitlistEnabled: false,
  waitlistOfferTtlHours: "24",
  saleStartsAt: "",
  saleEndsAt: "",
};

export function toDraft(t: EventTicketType): Draft {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    kind: t.kind === "GROUP" ? "GROUP" : "INDIVIDUAL",
    price: String(Number(t.price)),
    groupPricingMode: t.groupPricingMode ?? "PER_GROUP",
    minGroupSize: t.minGroupSize != null ? String(t.minGroupSize) : "2",
    maxGroupSize: t.maxGroupSize != null ? String(t.maxGroupSize) : "5",
    capacity: t.totalQuantity != null ? String(t.totalQuantity) : "",
    perUserLimit: String(t.perUserLimit ?? 1),
    waitlistEnabled: t.waitlistEnabled ?? false,
    waitlistOfferTtlHours: String(t.waitlistOfferTtlHours ?? 24),
    saleStartsAt: isoToLocalInput(t.saleStartsAt),
    saleEndsAt: isoToLocalInput(t.saleEndsAt),
  };
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Waiting list opt-in for one ticket.
 *
 * A queue only means anything behind a capacity — an unlimited ticket never
 * sells out, so nobody could ever join it. Rather than let the organiser switch
 * on something that can never fire (the API rejects it anyway), the control is
 * disabled until a capacity is set and says why.
 */
function WaitlistToggle({
  draft,
  set,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
}) {
  const hasCapacity = draft.capacity.trim() !== "" && Number(draft.capacity) > 0;
  const isPaid = Number(draft.price) > 0;

  return (
    <div className="rounded-lg border border-border p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={hasCapacity && draft.waitlistEnabled}
          disabled={!hasCapacity}
          onChange={(e) => set({ waitlistEnabled: e.target.checked })}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            Keep a waiting list when this sells out
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {hasCapacity
              ? "Buyers join a queue instead of being turned away. You choose who gets in when a seat frees up."
              : draft.waitlistEnabled
                ? "Saving with no capacity turns the waiting list off: an unlimited ticket never sells out. Anyone already queued stays on the list."
                : "Set a capacity first. A ticket with unlimited capacity never sells out, so nobody would ever join the queue."}
          </span>
        </span>
      </label>

      {hasCapacity && draft.waitlistEnabled && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {isPaid
              ? "When you let someone in, their seat is held for them with no time limit while they pay. If they never pay, revoke the offer from the waiting list to free the seat."
              : "This ticket is free, so anyone you let in is confirmed straight away with nothing to pay."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Optional on-sale window for one ticket.
 *
 * Both bounds are independent: set only a start to schedule a drop, only an end
 * to close sales early, or both for a fixed window. Left blank, the ticket is on
 * sale for the life of the event. The inputs are browser-local; the payload is
 * converted to ISO before it leaves the page.
 */
function SalesWindow({
  draft,
  set,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
}) {
  // Flag an obviously inverted window so the organiser catches it before saving.
  const inverted =
    draft.saleStartsAt !== "" &&
    draft.saleEndsAt !== "" &&
    new Date(draft.saleEndsAt) <= new Date(draft.saleStartsAt);

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-foreground">Sales window (optional)</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Choose when this ticket goes on sale and when it closes. Leave a field
        blank to leave that side open.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Sales start">
          <Input
            type="datetime-local"
            value={draft.saleStartsAt}
            onChange={(e) => set({ saleStartsAt: e.target.value })}
          />
        </Field>
        <Field label="Sales end">
          <Input
            type="datetime-local"
            value={draft.saleEndsAt}
            onChange={(e) => set({ saleEndsAt: e.target.value })}
          />
        </Field>
      </div>
      {inverted && (
        <p className="mt-2 text-xs text-destructive">
          Sales end is on or before sales start — no one would be able to buy.
        </p>
      )}
    </div>
  );
}

/** Core ticket fields (name, type, price, capacity, group config). */
export function TicketForm({
  title,
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: {
  title: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. General Admission"
            />
          </Field>
          <Field label="Type">
            <Select
              value={draft.kind}
              onValueChange={(v) => set({ kind: v as Draft["kind"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="GROUP">Group</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Description (optional)">
          <Input
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Shown to attendees"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={
              draft.kind === "GROUP" && draft.groupPricingMode === "PER_PERSON"
                ? "Price per person (₹, 0 = free)"
                : draft.kind === "GROUP"
                ? "Price per group (₹, 0 = free)"
                : "Price (₹, 0 = free)"
            }
          >
            <Input
              type="number"
              min={0}
              value={draft.price}
              onChange={(e) => set({ price: e.target.value })}
            />
          </Field>
          <Field label="Capacity (blank = unlimited)">
            <Input
              type="number"
              min={1}
              value={draft.capacity}
              onChange={(e) => set({ capacity: e.target.value })}
              placeholder="Unlimited"
            />
          </Field>
        </div>

        <SalesWindow draft={draft} set={set} />

        <WaitlistToggle draft={draft} set={set} />

        {draft.kind === "GROUP" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Pricing">
              <Select
                value={draft.groupPricingMode}
                onValueChange={(v) =>
                  set({ groupPricingMode: v as GroupPricingMode })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PER_GROUP">Per group</SelectItem>
                  <SelectItem value="PER_PERSON">Per person</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Min group size">
              <Input
                type="number"
                min={1}
                value={draft.minGroupSize}
                onChange={(e) => set({ minGroupSize: e.target.value })}
              />
            </Field>
            <Field label="Max group size">
              <Input
                type="number"
                min={1}
                value={draft.maxGroupSize}
                onChange={(e) => set({ maxGroupSize: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          <Field label="Max per person">
            <Input
              type="number"
              min={1}
              value={draft.perUserLimit}
              onChange={(e) => set({ perUserLimit: e.target.value })}
              className="sm:w-40"
            />
          </Field>
        )}


        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Registration questions live in their own module.
export { FormFieldsManager } from "./form-fields-manager";
