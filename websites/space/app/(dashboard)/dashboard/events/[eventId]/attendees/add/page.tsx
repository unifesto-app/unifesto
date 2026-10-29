"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, WarningCircle } from "@unifesto/unicon/react";
import { getEventById, getManageTicketTypes } from "@/console/lib/api/events-api";
import type { Event, EventTicketType, EventFormField } from "@/console/lib/api/events-api";
import {
  manualAddAttendee,
  type ManualGroupMember,
} from "@/console/lib/api/registrations-api";
import {
  createFreeAddRequest,
  getEventFreeAddRequests,
  freeSeatsLeft,
  type FreeAddRequest,
  type FreeAddRequestStatus,
} from "@/console/lib/api/free-add-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { QuestionInputs } from "@/console/components/events/question-inputs";
import { formatAnswer, visibleFieldIds } from "@/console/lib/form-questions";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Textarea } from "@/console/components/ui/textarea";
import { Label } from "@/console/components/ui/label";
import { Card, CardContent } from "@/console/components/ui/card";
import { Skeleton } from "@/console/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";

/** Attendee-facing gender labels (match the mobile registration options). */
const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];

/** Custom form fields that belong to a given ticket type (or event-wide). */
function fieldsForTicket(event: Event, ticketTypeId: string): EventFormField[] {
  return (event.formFields ?? [])
    .filter((f) => !f.ticketTypeId || f.ticketTypeId === ticketTypeId)
    .sort((a, b) => a.order - b.order);
}

/**
 * A phone as the 10 digits the API wants, or null. Accepts what people paste:
 * "+91 98765 43210", "098765 43210", "9876543210".
 */
function tenDigits(raw: string | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[0-9]{10}$/.test(d) ? d : null;
}

const isBlank = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** The first required, visible question left blank, or null. */
function missingRequired(fields: EventFormField[], answers: Record<string, unknown>): EventFormField | null {
  const visible = visibleFieldIds(fields, answers);
  return fields.find((f) => f.type !== "SECTION" && f.isRequired && visible.has(f.id) && isBlank(answers[f.id])) ?? null;
}

/** One label/value line in the review summary; hidden when the value is empty. */
function SummaryRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default function AddAttendeePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  // The manage list: hidden and paused tiers too, which an organiser can still
  // add people to (the public event payload leaves them out).
  const [managed, setManaged] = useState<EventTicketType[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, tiers] = await Promise.all([getEventById(eventId), getManageTicketTypes(eventId)]);
    if (error) setError(error.message);
    else if (data) setEvent(data);
    setManaged(tiers.data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ticketTypes = managed ?? event?.ticketTypes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/events/${eventId}/attendees`)}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to attendees
        </Button>
      </div>

      <PageHeader
        title="Add attendee"
        subtitle="Add one person manually, or send them a payment link."
      />

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : ticketTypes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No ticket types yet</p>
            <p className="text-sm text-muted-foreground">
              Add a ticket type or RSVP option before adding attendees.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <SingleAddForm event={event!} ticketTypes={ticketTypes} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SingleAddForm({
  event,
  ticketTypes,
}: {
  event: Event;
  ticketTypes: EventTicketType[];
}) {
  const [ticketTypeId, setTicketTypeId] = useState(ticketTypes[0].id);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [gender, setGender] = useState("");
  const [groupSize, setGroupSize] = useState<number>(
    ticketTypes[0].minGroupSize ?? 2
  );
  const [members, setMembers] = useState<ManualGroupMember[]>([]);
  // Lead's per-member answers (or the sole attendee's, for individual tickets).
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  // Team-wide (per-group) answers, asked once — group tickets only.
  const [teamValues, setTeamValues] = useState<Record<string, unknown>>({});
  // Collecting payment is the default and can only be turned off against free
  // seats a Platform Admin approved for this ticket (A27).
  const [freeRequests, setFreeRequests] = useState<FreeAddRequest[]>([]);
  const [collectPayment, setCollectPayment] = useState(true);
  // Free-add exception request state.
  const [reqOpen, setReqOpen] = useState(false);
  const [reqReason, setReqReason] = useState("");
  const [reqSeats, setReqSeats] = useState("10");
  const [reqThisTicket, setReqThisTicket] = useState(true);
  const [reqBusy, setReqBusy] = useState(false);
  // Two-phase: fill the form, then review before committing.
  const [step, setStep] = useState<"form" | "review">("form");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ message: string; link?: string } | null>(
    null
  );

  const ticket = useMemo(
    () => ticketTypes.find((t) => t.id === ticketTypeId)!,
    [ticketTypes, ticketTypeId]
  );
  const isGroup = ticket.kind === "GROUP";
  const isPaid = ticket.price > 0;
  const allFields = fieldsForTicket(event, ticketTypeId);
  // Per-group fields only exist on group tickets; everything else is per-member.
  const perMemberFields = isGroup
    ? allFields.filter((f) => !f.perGroup)
    : allFields;
  const teamFields = isGroup ? allFields.filter((f) => f.perGroup) : [];

  // Group-size bounds for the selected ticket (min 1, max unbounded → Infinity).
  const minSize = ticket.minGroupSize ?? 1;
  const maxSize = ticket.maxGroupSize ?? Infinity;
  const clampSize = (n: number) => {
    if (!Number.isFinite(n)) return minSize;
    return Math.min(maxSize, Math.max(minSize, Math.round(n)));
  };

  // Switching ticket types can leave the group size outside the new ticket's
  // bounds — pull it back in (and seed it from the min on first select).
  useEffect(() => {
    if (isGroup) setGroupSize((s) => clampSize(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketTypeId]);

  // Other members to capture (member 1 is the lead in the fields above), so a
  // group of N shows N-1 member rows and every one of them is required.
  const extraSlots = isGroup ? Math.max(0, groupSize - 1) : 0;

  // Free seats this add would use: each seat of a per-person group, else one.
  const seatsNeeded = isGroup && ticket.groupPricingMode === "PER_PERSON" ? groupSize : 1;
  const freeLeft = freeSeatsLeft(freeRequests, ticketTypeId);
  const allowFree = freeLeft === null || freeLeft >= seatsNeeded;
  const reqStatus: FreeAddRequestStatus | null = freeRequests.some((r) => r.status === "PENDING")
    ? "PENDING"
    : null;
  // Payment is forced on for a paid ticket unless there are free seats for it.
  const effectiveCollectPayment = isPaid && (allowFree ? collectPayment : true);

  // Free seats approved for this event, and any request still waiting.
  const loadFreeRequests = useCallback(() => {
    getEventFreeAddRequests(event.id).then(({ data }) => setFreeRequests(data ?? []));
  }, [event.id]);
  useEffect(() => {
    if (isPaid) loadFreeRequests();
  }, [isPaid, loadFreeRequests]);

  const submitRequest = async () => {
    const seats = Math.trunc(Number(reqSeats));
    if (!reqReason.trim() || !(seats >= 1)) return;
    setReqBusy(true);
    const { error } = await createFreeAddRequest(event.id, reqReason.trim(), {
      seats,
      ticketTypeId: reqThisTicket ? ticketTypeId : undefined,
    });
    setReqBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    loadFreeRequests();
    setReqOpen(false);
    setReqReason("");
  };

  const setMember = (i: number, patch: Partial<ManualGroupMember>) => {
    setMembers((prev) => {
      const next = [...prev];
      const base: ManualGroupMember = next[i] ?? { name: "" };
      next[i] = { ...base, ...patch };
      return next;
    });
  };

  const setMemberField = (i: number, fieldId: string, value: unknown) => {
    setMembers((prev) => {
      const next = [...prev];
      const base: ManualGroupMember = next[i] ?? { name: "" };
      next[i] = {
        ...base,
        customFields: { ...(base.customFields ?? {}), [fieldId]: value },
      };
      return next;
    });
  };

  const fieldLabel = (id: string) =>
    allFields.find((f) => f.id === id)?.label ?? id;

  const cleanedMembers = members
    .slice(0, extraSlots)
    .filter((m) => m && (m.name?.trim() || m.email?.trim()))
    .map((m) => ({
      name: m.name?.trim() || "Guest",
      email: m.email?.trim() || undefined,
      mobile: tenDigits(m.mobile) ?? undefined,
      gender: m.gender?.trim() || undefined,
      customFields:
        m.customFields && Object.keys(m.customFields).length
          ? m.customFields
          : undefined,
    }));

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Name / Email / Phone / Gender are mandatory for the primary attendee AND for
   * every member of a group (a group of N needs all N people fully captured).
   */
  const validate = (): string | null => {
    if (!name.trim()) return "Name is required.";
    if (!EMAIL_RE.test(email.trim())) return "A valid email is required.";
    if (!tenDigits(mobile))
      return "A valid 10-digit phone number is required.";
    if (!gender) return "Gender is required.";
    const leadMissing = missingRequired(perMemberFields, formValues);
    if (leadMissing) return `"${leadMissing.label}" is required.`;
    const teamMissing = missingRequired(teamFields, teamValues);
    if (teamMissing) return `"${teamMissing.label}" is required.`;

    if (isGroup) {
      if (groupSize < minSize || groupSize > maxSize) {
        return `Group size must be ${
          Number.isFinite(maxSize) ? `between ${minSize} and ${maxSize}` : `at least ${minSize}`
        }.`;
      }
      for (let i = 0; i < extraSlots; i++) {
        const m = members[i];
        const who = `Member ${i + 2}`;
        if (!m?.name?.trim()) return `${who}: name is required.`;
        if (!EMAIL_RE.test((m.email ?? "").trim()))
          return `${who}: a valid email is required.`;
        if (!tenDigits(m.mobile))
          return `${who}: a valid 10-digit phone number is required.`;
        if (!m.gender) return `${who}: gender is required.`;
        const memberMissing = missingRequired(perMemberFields, m.customFields ?? {});
        if (memberMissing) return `${who}: "${memberMissing.label}" is required.`;
      }
    }
    return null;
  };

  const goReview = () => {
    setResult(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setStep("review");
  };

  const confirm = async () => {
    setError("");
    setSubmitting(true);
    // For a group: formResponses = team-wide answers, leadCustomFields = the
    // lead's own answers. For an individual: formResponses = the person's answers.
    const { data, error } = await manualAddAttendee(event.id, {
      ticketTypeId,
      name: name.trim(),
      email: email.trim(),
      mobile: tenDigits(mobile) ?? mobile.trim(),
      gender,
      groupSize: isGroup ? groupSize : undefined,
      groupMembers: isGroup ? cleanedMembers : undefined,
      formResponses: isGroup
        ? Object.keys(teamValues).length
          ? teamValues
          : undefined
        : Object.keys(formValues).length
          ? formValues
          : undefined,
      leadCustomFields:
        isGroup && Object.keys(formValues).length ? formValues : undefined,
      collectPayment: effectiveCollectPayment,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setResult({ message: data.message, link: data.paymentLinkUrl });
      // Reset for the next entry and return to the form.
      setName("");
      setEmail("");
      setMobile("");
      setGender("");
      setMembers([]);
      setFormValues({});
      setTeamValues({});
      setStep("form");
    }
  };

  // ---- Review screen ------------------------------------------------------
  if (step === "review") {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-md border">
          <div className="border-b px-4 py-2 text-sm font-medium">
            Review before {isPaid && collectPayment ? "sending the payment link" : "adding"}
          </div>
          <div className="divide-y px-4">
            <div className="py-2">
              <SummaryRow label="Ticket" value={`${ticket.name}${ticket.price > 0 ? ` — ₹${ticket.price}` : " — Free"}`} />
              {isGroup && <SummaryRow label="Group size" value={String(groupSize)} />}
            </div>

            <div className="py-2">
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                {isGroup ? "Lead attendee" : "Attendee"}
              </p>
              <SummaryRow label="Name" value={name} />
              <SummaryRow label="Email" value={email} />
              <SummaryRow label="Phone" value={mobile} />
              <SummaryRow label="Gender" value={gender} />
              {perMemberFields.map((f) => (
                <SummaryRow key={f.id} label={f.label} value={formatAnswer(formValues[f.id])} />
              ))}
            </div>

            {isGroup && teamFields.length > 0 && (
              <div className="py-2">
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  Team details
                </p>
                {teamFields.map((f) => (
                  <SummaryRow key={f.id} label={f.label} value={formatAnswer(teamValues[f.id])} />
                ))}
              </div>
            )}

            {isGroup &&
              cleanedMembers.map((m, i) => (
                <div key={i} className="py-2">
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Member {i + 2}
                  </p>
                  <SummaryRow label="Name" value={m.name} />
                  <SummaryRow label="Email" value={m.email} />
                  <SummaryRow label="Phone" value={m.mobile} />
                  <SummaryRow label="Gender" value={m.gender} />
                  {Object.entries(m.customFields ?? {}).map(([id, val]) => (
                    <SummaryRow key={id} label={fieldLabel(id)} value={formatAnswer(val)} />
                  ))}
                </div>
              ))}

            <div className="py-2">
              <SummaryRow
                label="Action"
                value={
                  effectiveCollectPayment
                    ? `Send a payment link for ₹${ticket.price}`
                    : "Add as a confirmed attendee (free)"
                }
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <WarningCircle className="h-4 w-4" />
            {error}
          </p>
        )}

        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => setStep("form")} disabled={submitting}>
            <ArrowLeft className="h-4 w-4" />
            Back to edit
          </Button>
          <Button onClick={confirm} disabled={submitting}>
            {submitting
              ? "Working..."
              : effectiveCollectPayment
                ? "Confirm & send payment link"
                : "Confirm & add"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="add-ticket-type">Ticket type</Label>
        <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
          <SelectTrigger id="add-ticket-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ticketTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.price > 0 ? ` — ₹${t.price}` : " — Free"}
                {t.isVisible === false ? " (hidden)" : t.isActive === false ? " (paused)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="add-name">Name</Label>
          <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Rao" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="add-email">Email</Label>
          <Input id="add-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="asha@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="add-phone">
            Phone<span className="text-destructive"> *</span>
          </Label>
          <Input id="add-phone"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="9876543210"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="add-gender">
            Gender<span className="text-destructive"> *</span>
          </Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger id="add-gender">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isGroup && (
          <div className="space-y-2">
            <Label htmlFor="add-group-size">Group size</Label>
            <Input id="add-group-size"
              type="number"
              min={ticket.minGroupSize ?? 1}
              max={ticket.maxGroupSize ?? undefined}
              value={groupSize}
              onChange={(e) => setGroupSize(clampSize(Number(e.target.value)))}
            />
            <p className="text-xs text-muted-foreground">
              {ticket.maxGroupSize
                ? `${minSize}–${ticket.maxGroupSize} people`
                : `At least ${minSize} people`}
            </p>
          </div>
        )}
      </div>

      {/* Team-wide questions (asked once for the whole group). */}
      {isGroup && teamFields.length > 0 && (
        <div role="group" aria-labelledby="add-team-details" className="space-y-3 rounded-md border p-3">
          <Label id="add-team-details" className="text-muted-foreground">Team details</Label>
          <QuestionInputs
            eventId={event.id}
            fields={teamFields}
            values={teamValues}
            onChange={(id, val) =>
              setTeamValues((prev) => ({ ...prev, [id]: val }))
            }
          />
        </div>
      )}

      {/* Lead's own per-member answers (individual: the attendee's answers). */}
      {perMemberFields.length > 0 && (
        <div
          className="space-y-3"
          role={isGroup ? "group" : undefined}
          aria-labelledby={isGroup ? "add-lead-details" : undefined}
        >
          {isGroup && (
            <Label id="add-lead-details" className="text-muted-foreground">
              {name.trim() || "Lead"}&rsquo;s details
            </Label>
          )}
          <QuestionInputs
            eventId={event.id}
            fields={perMemberFields}
            values={formValues}
            onChange={(id, val) =>
              setFormValues((prev) => ({ ...prev, [id]: val }))
            }
          />
        </div>
      )}

      {isGroup && extraSlots > 0 && (
        <div className="space-y-2">
          <Label id="add-other-members-label">
            Other members
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              all fields required for each member
            </span>
          </Label>
          <div role="group" aria-labelledby="add-other-members-label" className="space-y-3">
            {Array.from({ length: extraSlots }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-md border p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    placeholder={`Member ${i + 2} name`}
                    value={members[i]?.name ?? ""}
                    onChange={(e) => setMember(i, { name: e.target.value })}
                  />
                  <Input
                    placeholder="Email"
                    value={members[i]?.email ?? ""}
                    onChange={(e) => setMember(i, { email: e.target.value })}
                  />
                  <Input
                    placeholder="Phone"
                    value={members[i]?.mobile ?? ""}
                    onChange={(e) => setMember(i, { mobile: e.target.value })}
                  />
                  <Select
                    value={members[i]?.gender ?? ""}
                    onValueChange={(v) => setMember(i, { gender: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <QuestionInputs
            eventId={event.id}
                  fields={perMemberFields}
                  values={members[i]?.customFields ?? {}}
                  onChange={(id, val) => setMemberField(i, id, val)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {isPaid && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={effectiveCollectPayment}
              disabled={!allowFree}
              onChange={(e) => setCollectPayment(e.target.checked)}
            />
            <span>
              <span className="font-medium">Collect payment from the attendee</span>
              <span className="block text-muted-foreground">
                Razorpay emails/texts them a payment link for ₹{ticket.price}; the
                seat is held as pending until they pay.
                {allowFree
                  ? ` Uncheck to add them for free (${freeLeft === null ? "free adds allowed" : `${freeLeft} free seat${freeLeft === 1 ? "" : "s"} left on this ticket`}).`
                  : freeLeft
                    ? ` Required: this needs ${seatsNeeded} free seats and ${freeLeft} are left.`
                    : " Required: no free seats are approved for this ticket."}
              </span>
            </span>
          </label>

          {!allowFree && (
            <div className="rounded-md border border-dashed p-3 text-sm">
              {reqStatus === "PENDING" ? (
                <p className="text-muted-foreground">
                  A request to add attendees for free is awaiting platform review.
                </p>
              ) : reqOpen ? (
                <div className="space-y-2">
                  <Label id="add-how-many-seats-do-you-need-to-ad-label">How many seats do you need to add for free?</Label>
                  <div role="group" aria-labelledby="add-how-many-seats-do-you-need-to-ad-label" className="flex flex-wrap items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      className="h-9 w-28"
                      value={reqSeats}
                      onChange={(e) => setReqSeats(e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={reqThisTicket}
                        onChange={(e) => setReqThisTicket(e.target.checked)}
                      />
                      Only for {ticket.name}
                    </label>
                  </div>
                  <Label htmlFor="add-why-do-you-need-to-add-attendees">Why do you need to add attendees for free?</Label>
                  <Textarea id="add-why-do-you-need-to-add-attendees"
                    rows={3}
                    value={reqReason}
                    onChange={(e) => setReqReason(e.target.value)}
                    placeholder="e.g. Comped press & sponsor passes for this event."
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReqOpen(false)}
                      disabled={reqBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={submitRequest}
                      disabled={reqBusy || !reqReason.trim() || !(Number(reqSeats) >= 1)}
                    >
                      {reqBusy ? "Sending..." : "Send request"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground">
                    {freeLeft === 0 && freeRequests.some((r) => r.status === "APPROVED")
                      ? "The free seats approved for this ticket are used up. Ask a platform admin for more."
                      : "Need to add someone for free? Ask a platform admin for free seats on this event."}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setReqOpen(true)}>
                    Request permission
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <WarningCircle className="h-4 w-4" />
          {error}
        </p>
      )}
      {result && (
        <div className="rounded-md border border-success/30 bg-success-soft p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-success">
            <CheckCircle className="h-4 w-4" weight="fill" />
            {result.message}
          </p>
          {result.link && (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              Payment link:{" "}
              <a href={result.link} target="_blank" rel="noreferrer" className="underline">
                {result.link}
              </a>
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={goReview}>Review</Button>
      </div>
    </div>
  );
}
