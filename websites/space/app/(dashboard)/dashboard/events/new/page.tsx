"use client";

import { inr } from "@/lib/utils/money";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Lock,
  Check,
  Plus,
  Trash,
} from "@unifesto/unicon/react";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useSession } from "@/lib/context/SessionContext";
import {
  createEvent,
  createTicketType,
  type CreateEventPayload,
  type TicketTypePayload,
  type EventType,
  type RegistrationType,
  type EventVisibility,
} from "@/lib/api/events-api";
import { getCategories, type Category } from "@/lib/api/categories-api";
import {
  EVENT_TYPES,
  VISIBILITY_OPTIONS,
  INDIAN_STATES,
  toIso,
  toLocalDatetime,
} from "@/lib/constants/event-form";
import { PageHeader } from "@/components/shared/PageHeader";
import { RecurrenceEditor } from "@/components/events/RecurrenceEditor";
import { PlaceSearch } from "@/components/events/PlaceSearch";
import type { PickedPlace } from "@/lib/googlePlaces";
import {
  buildRRule,
  defaultRecurrence,
  describeRecurrence,
  recurrenceError,
  type RecurrenceState,
} from "@/lib/recurrence";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** One ticket/RSVP row, held as strings and turned into a payload on submit. */
interface TicketDraft {
  key: string;
  name: string;
  price: string; // rupees as typed; forced 0 for RSVP
  capacity: string; // blank = unlimited
}

interface WizardForm {
  title: string;
  description: string;
  type: EventType;
  category: string;
  startDateTime: string; // datetime-local
  endDateTime: string; // datetime-local
  venueName: string;
  venueAddress: string;
  city: string;
  state: string;
  /** Exact venue pin from Places search; null when typed by hand. */
  latitude: number | null;
  longitude: number | null;
  onlineUrl: string;
  onlinePlatform: string;
  registrationType: RegistrationType;
  visibility: EventVisibility;
  tickets: TicketDraft[];
  recurrence: RecurrenceState;
}

function newTicketKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function defaultTickets(rt: RegistrationType): TicketDraft[] {
  return rt === "TICKETED"
    ? [{ key: newTicketKey(), name: "General Admission", price: "", capacity: "" }]
    : [{ key: newTicketKey(), name: "I'll attend", price: "0", capacity: "" }];
}

/** Seed tomorrow 10:00 → 12:00, local time. */
function defaultSchedule(): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    start: toLocalDatetime(start.toISOString()),
    end: toLocalDatetime(end.toISOString()),
  };
}

function initialForm(): WizardForm {
  const { start, end } = defaultSchedule();
  return {
    title: "",
    description: "",
    type: "IN_PERSON",
    category: "",
    startDateTime: start,
    endDateTime: end,
    venueName: "",
    venueAddress: "",
    city: "",
    state: "",
    latitude: null,
    longitude: null,
    onlineUrl: "",
    onlinePlatform: "",
    registrationType: "RSVP",
    visibility: "PUBLIC",
    tickets: defaultTickets("RSVP"),
    // Seed the weekly weekday from the default start date so "Repeats weekly"
    // pre-selects the right day.
    recurrence: defaultRecurrence(new Date(start).getDay()),
  };
}

type StepId = "basics" | "location" | "registration" | "tickets" | "review";

const STEPS: { id: StepId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "location", label: "Location" },
  { id: "registration", label: "Registration" },
  { id: "tickets", label: "Tickets" },
  { id: "review", label: "Review" },
];

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

/** A row of selectable tiles — one clean control for type/mode/visibility. */
function OptionTiles<T extends string>({
  value,
  options,
  onChange,
  cols = 3,
}: {
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "rounded-lg border px-3.5 py-3 text-left transition-colors",
              active
                ? "border-primary bg-primary-soft/40"
                : "border-border hover:border-border-strong"
            )}
          >
            <span className="block text-sm font-medium text-foreground">
              {o.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {o.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A labelled field: label above, control below. */
function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CreateEventInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const spaceId = useSpaceId();
  const { can, hasFeature } = useSession();
  const allowed = can("space:create-event");

  const parentId = searchParams.get("parentId") || undefined;
  const isSubEvent = Boolean(parentId);

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<WizardForm>(initialForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Set once the event exists, so a failed ticket retry can't create a duplicate.
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await getCategories();
      if (active && data) setCategories(data);
    })();
    return () => {
      active = false;
    };
  }, []);

  const step = STEPS[stepIndex];
  const isPaid = form.registrationType === "TICKETED";
  const showVenue = form.type === "IN_PERSON" || form.type === "HYBRID";
  const showOnline = form.type === "ONLINE" || form.type === "HYBRID";
  const noun = isSubEvent ? "sub-event" : "event";

  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // A picked place fills the venue and pins exact coordinates.
  const pickPlace = (p: PickedPlace) =>
    setForm((f) => ({
      ...f,
      venueName: p.name,
      venueAddress: p.address,
      city: p.city || f.city,
      state: p.state || f.state,
      latitude: p.latitude,
      longitude: p.longitude,
    }));
  // Hand-editing where the venue is makes the saved pin stale, so drop it.
  // (Renaming the venue keeps the pin.)
  const setLocationField = (key: "venueAddress" | "city" | "state", value: string) =>
    setForm((f) => ({ ...f, [key]: value, latitude: null, longitude: null }));

  function setRegistrationType(rt: RegistrationType) {
    setForm((f) => {
      const same = (list: TicketDraft[]) =>
        JSON.stringify(list.map(({ name, price, capacity }) => ({ name, price, capacity })));
      const untouched = same(f.tickets) === same(defaultTickets(f.registrationType));
      return {
        ...f,
        registrationType: rt,
        tickets: untouched ? defaultTickets(rt) : f.tickets,
      };
    });
  }

  const updateTicket = (key: string, patch: Partial<TicketDraft>) =>
    setForm((f) => ({
      ...f,
      tickets: f.tickets.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    }));

  const addTicket = () =>
    setForm((f) => ({
      ...f,
      tickets: [
        ...f.tickets,
        { key: newTicketKey(), name: "", price: isPaid ? "" : "0", capacity: "" },
      ],
    }));

  const removeTicket = (key: string) =>
    setForm((f) => ({ ...f, tickets: f.tickets.filter((t) => t.key !== key) }));

  function validateStep(id: StepId): string {
    switch (id) {
      case "basics":
        if (form.title.trim().length < 3)
          return "Give the event a name of at least 3 characters.";
        if (!form.startDateTime) return "Pick a start date and time.";
        if (!form.endDateTime) return "Pick an end date and time.";
        if (new Date(form.endDateTime) <= new Date(form.startDateTime))
          return "The end time must be after the start time.";
        return recurrenceError(form.recurrence, form.startDateTime, isSubEvent);
      case "location":
        if (showOnline && form.onlineUrl.trim()) {
          try {
            new URL(form.onlineUrl.trim());
          } catch {
            return "The joining link doesn't look like a valid URL.";
          }
        }
        return "";
      case "tickets":
        for (const t of form.tickets) {
          const started = t.name.trim() || t.price.trim() || t.capacity.trim();
          if (started && !t.name.trim())
            return "Give each row a name, or remove it.";
          // A blank price on a paid event is a mistake, not a free ticket (A31).
          if (isPaid && t.name.trim() && !t.price.trim())
            return `Enter a price for ${t.name.trim()} (type 0 to make it free).`;
          if (isPaid && t.name.trim() && t.price.trim()) {
            const p = Number(t.price);
            if (Number.isNaN(p) || p < 0)
              return "Enter a valid ticket price (0 or more).";
          }
          if (t.capacity.trim()) {
            const c = Number(t.capacity);
            if (!Number.isInteger(c) || c < 1)
              return "Capacity must be a whole number of 1 or more.";
          }
        }
        return "";
      default:
        return "";
    }
  }

  const stepError = useMemo(
    () => validateStep(step.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step.id, form]
  );

  function goNext() {
    const err = validateStep(step.id);
    if (err) return setError(err);
    setError("");
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setError("");
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function buildPayload(): CreateEventPayload {
    return {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      registrationType: form.registrationType,
      startDateTime: toIso(form.startDateTime),
      endDateTime: toIso(form.endDateTime),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
      visibility: form.visibility,
      isFree: !isPaid,
      category: form.category || undefined,
      ...(showVenue
        ? {
            venueName: form.venueName.trim() || undefined,
            venueAddress: form.venueAddress.trim() || undefined,
            city: form.city.trim() || undefined,
            state: form.state.trim() || undefined,
            ...(form.latitude != null && form.longitude != null
              ? { latitude: form.latitude, longitude: form.longitude }
              : {}),
          }
        : {}),
      ...(showOnline
        ? {
            onlineUrl: form.onlineUrl.trim() || undefined,
            onlinePlatform: form.onlinePlatform.trim() || undefined,
          }
        : {}),
      spaceId: spaceId as string,
      ...(parentId ? { parentEventId: parentId } : {}),
      // A recurring series (never combined with a sub-event parent).
      ...(!parentId && buildRRule(form.recurrence)
        ? { recurrenceRule: buildRRule(form.recurrence) as string }
        : {}),
    };
  }

  function ticketPayloads(): TicketTypePayload[] {
    return form.tickets
      .filter((t) => t.name.trim())
      .map((t) => {
        const capacity = t.capacity.trim() ? Number(t.capacity) : undefined;
        return isPaid
          ? {
              name: t.name.trim(),
              kind: "INDIVIDUAL" as const,
              price: Number(t.price) || 0,
              totalQuantity: capacity,
              perUserLimit: 1,
            }
          : {
              name: t.name.trim(),
              kind: "RSVP" as const,
              price: 0,
              totalQuantity: capacity,
            };
      });
  }

  const overviewHref = (id: string) => `/dashboard/events/${id}`;

  async function submit() {
    if (createdEventId) {
      router.push(overviewHref(createdEventId));
      return;
    }
    for (const s of STEPS) {
      const err = validateStep(s.id);
      if (err) return setError(err);
    }
    if (!spaceId) {
      setError("No space selected. Pick a space from the switcher first.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: apiError } = await createEvent(buildPayload());
    if (apiError || !data) {
      setError(apiError?.message ?? "Could not create the event.");
      setBusy(false);
      return;
    }
    // Tickets are best-effort against the new event. If any is rejected we
    // don't roll back — we surface which ones failed.
    const failed: string[] = [];
    for (const payload of ticketPayloads()) {
      const { error: ticketError } = await createTicketType(data.id, payload);
      if (ticketError) failed.push(`${payload.name} (${ticketError.message})`);
    }
    if (failed.length > 0) {
      setCreatedEventId(data.id);
      setBusy(false);
      setError(
        `Your event was created, but these couldn't be added: ${failed.join(
          "; "
        )}. Open the event to add them.`
      );
      return;
    }
    router.push(overviewHref(data.id));
  }

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Create event" />
        <EmptyState
          icon={Lock}
          title="Only a Space Admin can create events"
          description="Ask a Space Admin to create the event and assign you as its Curator."
        />
      </div>
    );
  }

  const isLast = stepIndex === STEPS.length - 1;
  const stepTitle: Record<StepId, string> = {
    basics: "Event basics",
    location: "Format & location",
    registration: "Registration",
    tickets: isPaid ? "Tickets" : "RSVP options",
    review: "Review",
  };
  const stepBlurb: Record<StepId, string> = {
    basics: "Name your event and set when it happens.",
    location: "Tell people how and where to join.",
    registration: "Choose how people sign up and who can see it.",
    tickets: isPaid
      ? "Add the tickets you'll sell — you can skip and do this later."
      : "Add your RSVP options — you can skip and do this later.",
    review: "Check the details, then create your event.",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title={isSubEvent ? "New sub-event" : "New event"}
        subtitle={`Step ${stepIndex + 1} of ${STEPS.length}`}
      />

      {/* Stepper — numbers + a thin rule, no pills */}
      <nav aria-label="Progress" className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-2">
          {STEPS.map((s, i) => {
            const state =
              i < stepIndex ? "done" : i === stepIndex ? "current" : "todo";
            return (
              <Fragment key={s.id}>
                <li>
                  <button
                    type="button"
                    onClick={() => i < stepIndex && setStepIndex(i)}
                    disabled={i >= stepIndex}
                    className="flex items-center gap-2 disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        "grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-medium transition-colors",
                        state === "current" &&
                          "bg-primary text-primary-foreground",
                        state === "done" && "bg-primary-soft text-primary",
                        state === "todo" &&
                          "border border-border text-muted-foreground"
                      )}
                    >
                      {state === "done" ? (
                        <Check className="h-3.5 w-3.5" weight="bold" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        state === "current"
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {s.label}
                    </span>
                  </button>
                </li>
                {i < STEPS.length - 1 && (
                  <li aria-hidden className="h-px w-6 flex-none bg-border" />
                )}
              </Fragment>
            );
          })}
        </ol>
      </nav>

      {error && <ErrorNotice message={error} />}

      {/* Step body */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {stepTitle[step.id]}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {stepBlurb[step.id]}
          </p>
        </div>

        {/* --- Basics --- */}
        {step.id === "basics" && (
          <div className="space-y-5">
            <Field label="Event name" htmlFor="title">
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Spring Hackathon 2026"
                maxLength={500}
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts" htmlFor="start">
                <Input
                  id="start"
                  type="datetime-local"
                  value={form.startDateTime}
                  onChange={(e) => set("startDateTime", e.target.value)}
                />
              </Field>
              <Field label="Ends" htmlFor="end">
                <Input
                  id="end"
                  type="datetime-local"
                  value={form.endDateTime}
                  onChange={(e) => set("endDateTime", e.target.value)}
                />
              </Field>
            </div>
            {/* Recurrence — a series can't also be a festival sub-event, so hide
                this when creating one under a parent. */}
            {!isSubEvent && (
              <Field label="Repeat">
                {hasFeature("hasRecurringEvents") ? (
                  <RecurrenceEditor
                    value={form.recurrence}
                    onChange={(next) => set("recurrence", next)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Repeating series aren&apos;t on this space&apos;s plan.{" "}
                    <a href="/dashboard/billing" className="underline">
                      See plans
                    </a>
                  </p>
                )}
              </Field>
            )}
            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What's it about? (optional)"
                rows={4}
              />
            </Field>
            <Field label="Category" htmlFor="category">
              <Select
                value={form.category || "none"}
                onValueChange={(v) => set("category", v === "none" ? "" : v)}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        {/* --- Location --- */}
        {step.id === "location" && (
          <div className="space-y-5">
            <Field label="Format">
              <OptionTiles
                value={form.type}
                options={EVENT_TYPES}
                onChange={(v) => set("type", v)}
              />
            </Field>

            {showVenue && (
              <div className="space-y-4">
                <Field label="Find the venue">
                  <PlaceSearch
                    onPick={pickPlace}
                    pinned={
                      form.latitude != null && form.longitude != null
                        ? { latitude: form.latitude, longitude: form.longitude }
                        : null
                    }
                    onClearPin={() => setForm((f) => ({ ...f, latitude: null, longitude: null }))}
                  />
                </Field>
                <Field label="Venue name" htmlFor="venueName">
                  <Input
                    id="venueName"
                    value={form.venueName}
                    onChange={(e) => set("venueName", e.target.value)}
                    placeholder="e.g. Convention Center"
                  />
                </Field>
                <Field label="Address" htmlFor="venueAddress">
                  <Input
                    id="venueAddress"
                    value={form.venueAddress}
                    onChange={(e) => setLocationField("venueAddress", e.target.value)}
                    placeholder="Street address"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="City" htmlFor="city">
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => setLocationField("city", e.target.value)}
                      placeholder="Mumbai"
                    />
                  </Field>
                  <Field label="State" htmlFor="state">
                    <Select
                      value={form.state || "none"}
                      onValueChange={(v) => setLocationField("state", v === "none" ? "" : v)}
                    >
                      <SelectTrigger id="state">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not sure yet</SelectItem>
                        {INDIAN_STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {showOnline && (
              <div className="space-y-4">
                <Field label="Joining link" htmlFor="onlineUrl">
                  <Input
                    id="onlineUrl"
                    type="url"
                    value={form.onlineUrl}
                    onChange={(e) => set("onlineUrl", e.target.value)}
                    placeholder="https://zoom.us/j/…"
                  />
                </Field>
                <Field label="Platform" htmlFor="onlinePlatform">
                  <Input
                    id="onlinePlatform"
                    value={form.onlinePlatform}
                    onChange={(e) => set("onlinePlatform", e.target.value)}
                    placeholder="Zoom, Google Meet, …"
                  />
                </Field>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Location is optional now — you can add it later from the event.
            </p>
          </div>
        )}

        {/* --- Registration --- */}
        {step.id === "registration" && (
          <div className="space-y-5">
            <Field label="How do people register?">
              <OptionTiles
                cols={2}
                value={form.registrationType}
                options={[
                  { value: "RSVP", label: "Free RSVP", hint: "No payment" },
                  { value: "TICKETED", label: "Paid tickets", hint: "Sell tickets" },
                ]}
                onChange={setRegistrationType}
              />
            </Field>
            <Field label="Who can see it?">
              <OptionTiles
                value={form.visibility}
                options={VISIBILITY_OPTIONS}
                onChange={(v) => set("visibility", v)}
              />
            </Field>
          </div>
        )}

        {/* --- Tickets --- */}
        {step.id === "tickets" && (
          <div className="space-y-4">
            <div className="space-y-3">
              {form.tickets.map((t, i) => (
                <div
                  key={t.key}
                  className="flex items-end gap-3 rounded-lg border border-border p-3"
                >
                  <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_7rem_7rem]">
                    <Field
                      label={isPaid ? "Ticket name" : "Option name"}
                      htmlFor={`t-name-${t.key}`}
                    >
                      <Input
                        id={`t-name-${t.key}`}
                        value={t.name}
                        onChange={(e) => updateTicket(t.key, { name: e.target.value })}
                        placeholder={isPaid ? "Early Bird" : "I'll attend"}
                      />
                    </Field>
                    {isPaid && (
                      <Field label="Price (₹)" htmlFor={`t-price-${t.key}`}>
                        <Input
                          id={`t-price-${t.key}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={t.price}
                          onChange={(e) =>
                            updateTicket(t.key, { price: e.target.value })
                          }
                          placeholder="0"
                        />
                      </Field>
                    )}
                    <Field label="Capacity" htmlFor={`t-cap-${t.key}`}>
                      <Input
                        id={`t-cap-${t.key}`}
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={t.capacity}
                        onChange={(e) =>
                          updateTicket(t.key, { capacity: e.target.value })
                        }
                        placeholder="∞"
                      />
                    </Field>
                  </div>
                  {form.tickets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTicket(t.key)}
                      className="mb-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      aria-label={`Remove ${t.name.trim() || `row ${i + 1}`}`}
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Button type="button" variant="secondary" size="sm" onClick={addTicket}>
              <Plus className="h-4 w-4" weight="bold" />
              Add {isPaid ? "ticket" : "option"}
            </Button>

            <p className="text-xs text-muted-foreground">
              Leave capacity blank for unlimited. Remove every row to skip.
            </p>
          </div>
        )}

        {/* --- Review --- */}
        {step.id === "review" && (
          <div className="space-y-4">
            <dl className="divide-y divide-border rounded-lg border border-border">
              <ReviewRow label="Name" value={form.title.trim() || "—"} />
              <ReviewRow
                label="When"
                value={
                  form.startDateTime
                    ? `${new Date(form.startDateTime).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })} → ${new Date(form.endDateTime).toLocaleString("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}`
                    : "—"
                }
              />
              {!isSubEvent && form.recurrence.enabled && (
                <ReviewRow label="Repeats" value={describeRecurrence(form.recurrence)} />
              )}
              <ReviewRow
                label="Format"
                value={
                  EVENT_TYPES.find((t) => t.value === form.type)?.label ??
                  form.type
                }
              />
              {showVenue && (
                <ReviewRow
                  label="Venue"
                  value={
                    [form.venueName, form.city].filter(Boolean).join(", ") ||
                    "To be added"
                  }
                />
              )}
              {showOnline && (
                <ReviewRow
                  label="Online"
                  value={form.onlineUrl.trim() || "Link to be added"}
                />
              )}
              <ReviewRow
                label="Registration"
                value={isPaid ? "Paid tickets" : "Free RSVP"}
              />
              <ReviewRow
                label="Visibility"
                value={
                  VISIBILITY_OPTIONS.find((v) => v.value === form.visibility)
                    ?.label ?? form.visibility
                }
              />
              {form.category && (
                <ReviewRow label="Category" value={form.category} />
              )}
            </dl>

            {(() => {
              const rows = form.tickets.filter((t) => t.name.trim());
              return (
                <div className="rounded-lg border border-border">
                  <p className="border-b border-border px-4 py-2 text-sm font-medium text-foreground">
                    {isPaid ? "Tickets" : "RSVP options"}
                  </p>
                  {rows.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                      None — add them on the event later.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {rows.map((t) => (
                        <li
                          key={t.key}
                          className="flex items-center justify-between gap-4 px-4 py-2.5"
                        >
                          <span className="min-w-0 truncate text-sm text-foreground">
                            {t.name.trim()}
                            {t.capacity.trim() && (
                              <span className="text-muted-foreground">
                                {" · "}
                                {t.capacity.trim()} cap
                              </span>
                            )}
                          </span>
                          <span className="flex-none text-sm font-medium text-foreground">
                            {isPaid
                              ? inr(t.price)
                              : "Free"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-5">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            stepIndex === 0 ? router.push("/dashboard/events") : goBack()
          }
          disabled={busy}
        >
          {stepIndex === 0 ? (
            "Cancel"
          ) : (
            <>
              <ArrowLeft className="h-4 w-4" weight="bold" />
              Back
            </>
          )}
        </Button>

        {isLast ? (
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Creating…" : createdEventId ? "Go to event" : `Create ${noun}`}
            {!busy &&
              (createdEventId ? (
                <ArrowRight className="h-4 w-4" weight="bold" />
              ) : (
                <Check className="h-4 w-4" weight="bold" />
              ))}
          </Button>
        ) : (
          <Button type="button" onClick={goNext} disabled={busy || !!stepError}>
            Next
            <ArrowRight className="h-4 w-4" weight="bold" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default function CreateEventPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <PageHeader title="Create event" subtitle="Loading…" />
        </div>
      }
    >
      <CreateEventInner />
    </Suspense>
  );
}
