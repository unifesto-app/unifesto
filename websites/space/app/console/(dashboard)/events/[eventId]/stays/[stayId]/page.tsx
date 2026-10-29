"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash, X } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Textarea } from "@/console/components/ui/textarea";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { ImageUploadCard } from "@/console/components/shared/ImageUploadCard";
import { FormFieldsManager, type QuestionPayload, type QuestionStore } from "@/console/components/events/form-fields-manager";
import { Chips, Field, FormCard, HackPage as Page, Toggle } from "@/console/components/hackathon/HackParts";
import { getEventById } from "@/console/lib/api/events-api";
import type { Result } from "@/console/lib/api/call";
import {
  addStayGalleryPhoto,
  createStay,
  createStayOption,
  createStayQuestion,
  deleteStay,
  deleteStayOption,
  deleteStayQuestion,
  GENDER_LABELS,
  getTeamStay,
  PAYMENT_LABELS,
  priceLabel,
  PROPERTY_LABELS,
  removeStayGalleryPhoto,
  STAY_GALLERY_MAX,
  staysBase,
  toDay,
  updateStay,
  updateStayOption,
  updateStayQuestion,
  uploadStayCover,
  type Stay,
  type StayGender,
  type StayInput,
  type StayOption,
  type StayPaymentMode,
  type StayPricing,
  type StayPropertyType,
} from "@/console/lib/api/stays";

const TYPES = (Object.keys(PROPERTY_LABELS) as StayPropertyType[]).map((k) => ({ value: k, label: PROPERTY_LABELS[k] }));

interface Draft {
  name: string;
  propertyType: StayPropertyType;
  description: string;
  address: string;
  city: string;
  mapUrl: string;
  amenities: string;
  houseRules: string;
  contactName: string;
  contactPhone: string;
  /** "YYYY-MM-DD". */
  checkInFrom: string;
  checkOutUntil: string;
  checkInTime: string;
  checkOutTime: string;
  requireIdProof: boolean;
  paymentWindowHours: string;
  isPublished: boolean;
}

const toDraft = (s: Stay): Draft => ({
  name: s.name,
  propertyType: s.propertyType,
  description: s.description ?? "",
  address: s.address ?? "",
  city: s.city ?? "",
  mapUrl: s.mapUrl ?? "",
  amenities: s.amenities.join(", "),
  houseRules: s.houseRules ?? "",
  contactName: s.contactName ?? "",
  contactPhone: s.contactPhone ?? "",
  checkInFrom: s.checkInFrom,
  checkOutUntil: s.checkOutUntil,
  checkInTime: s.checkInTime ?? "",
  checkOutTime: s.checkOutTime ?? "",
  requireIdProof: s.requireIdProof,
  paymentWindowHours: String(s.paymentWindowHours),
  isPublished: s.isPublished,
});

/** Result → the `{ error }` shape FormFieldsManager expects. */
const asStore = async (p: Promise<Result<unknown>>) => {
  const r = await p;
  return { error: r.ok ? null : { message: r.message } };
};
/** Stay questions have no per-group choice, so `perGroup` is left out. */
const stayBody = (b: QuestionPayload) => ({
  label: b.label,
  type: b.type,
  options: b.options,
  isRequired: b.isRequired,
  helpText: b.helpText,
  config: b.config,
  showIf: b.showIf,
  order: b.order,
});

// ── Rooms and beds (mobile StayOptionEditorScreen, inline) ────────────────

interface OptionDraft {
  name: string;
  description: string;
  gender: StayGender;
  totalBeds: string;
  price: string;
  pricing: StayPricing;
  paymentMode: StayPaymentMode;
  maxGuests: string;
  isActive: boolean;
}

const optionDraft = (o: StayOption | null): OptionDraft =>
  o
    ? {
        name: o.name,
        description: o.description ?? "",
        gender: o.gender,
        totalBeds: String(o.totalBeds),
        price: String(o.price),
        pricing: o.pricing,
        paymentMode: o.paymentMode === "FREE" ? "PAY_AT_PROPERTY" : o.paymentMode,
        maxGuests: String(o.maxGuests),
        isActive: o.isActive,
      }
    : { name: "", description: "", gender: "ANY", totalBeds: "", price: "0", pricing: "PER_NIGHT", paymentMode: "PAY_AT_PROPERTY", maxGuests: "1", isActive: true };

function OptionForm({ eventId, stayId, option, onDone }: { eventId: string; stayId: string; option: StayOption | null; onDone: (s?: Stay) => void }) {
  const [d, setD] = useState<OptionDraft>(() => optionDraft(option));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<OptionDraft>) => {
    setError("");
    setD((x) => ({ ...x, ...patch }));
  };
  const paid = Number(d.price || 0) > 0;

  const save = async () => {
    const beds = Number(d.totalBeds);
    const price = Number(d.price || 0);
    const maxGuests = Number(d.maxGuests);
    if (!d.name.trim()) return setError('Name this option, like "Dorm bed (boys)".');
    if (!Number.isInteger(beds) || beds < 1) return setError("How many beds? At least 1.");
    if (!(price >= 0)) return setError("Enter a price, or 0 for free.");
    if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 20) return setError("Guests per request has to be 1 to 20.");
    const body = {
      name: d.name.trim(),
      description: d.description.trim() || null,
      gender: d.gender,
      totalBeds: beds,
      price,
      pricing: d.pricing,
      paymentMode: price > 0 ? d.paymentMode : ("FREE" as const),
      maxGuests,
      isActive: d.isActive,
    };
    setBusy(true);
    const res = option ? await updateStayOption(eventId, stayId, option.id, body) : await createStayOption(eventId, stayId, body);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone(res.data);
  };

  const remove = async () => {
    if (!option || !window.confirm(`Delete ${option.name}? Only options nobody has booked can be deleted. Switch it off otherwise.`)) return;
    setBusy(true);
    const res = await deleteStayOption(eventId, stayId, option.id);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onDone(res.data);
  };

  return (
    <div className="space-y-4 bg-muted/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={d.name} placeholder="Dorm bed (boys)" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Description (optional)">
          <Input value={d.description} placeholder="6-bed room, shared bathroom" onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Beds" hint="Counted per night.">
          <Input inputMode="numeric" value={d.totalBeds} onChange={(e) => set({ totalBeds: e.target.value })} />
        </Field>
        <Field label="Guests per request" hint="More than 1 lets someone book for their team.">
          <Input inputMode="numeric" value={d.maxGuests} onChange={(e) => set({ maxGuests: e.target.value })} />
        </Field>
      </div>
      <Field label="Who it's for">
        <Chips
          options={(["ANY", "MALE", "FEMALE"] as StayGender[]).map((k) => ({ value: k, label: GENDER_LABELS[k] }))}
          value={d.gender}
          onChange={(g) => set({ gender: g })}
        />
      </Field>
      <Field label="Price (₹)" hint={paid ? undefined : "Free. Guests still need your approval."}>
        <Input inputMode="decimal" value={d.price} onChange={(e) => set({ price: e.target.value })} className="max-w-40" />
      </Field>
      {paid && (
        <>
          <Chips
            options={[
              { value: "PER_NIGHT" as StayPricing, label: "Per night" },
              { value: "PER_STAY" as StayPricing, label: "Per stay" },
            ]}
            value={d.pricing}
            onChange={(p) => set({ pricing: p })}
          />
          <Field label="Guests pay">
            <Chips
              options={[
                {
                  value: "PAY_AT_PROPERTY" as StayPaymentMode,
                  label: "At the property",
                  hint: "Your team collects the money at the property and marks it paid before check-in.",
                },
                {
                  value: "ONLINE" as StayPaymentMode,
                  label: "In the app",
                  hint: "After you approve, the guest pays in the app (a processing fee is added). The money joins this event's payout.",
                },
              ]}
              value={d.paymentMode}
              onChange={(p) => set({ paymentMode: p })}
            />
          </Field>
        </>
      )}
      <Toggle label="Taking bookings" hint="Switch off to stop new requests without losing existing ones." checked={d.isActive} onChange={(v) => set({ isActive: v })} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {option ? "Save option" : "Add option"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        {option && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
            <Trash className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

/**
 * Create or edit one Unifesto Stay (port of StayEditorScreen): the property,
 * when guests can stay, photos, what can be booked and what to ask. A new
 * stay is saved first, then options and questions are added to it.
 */
export default function StayEditorPage() {
  const { eventId, stayId } = useParams() as { eventId: string; stayId: string };
  const isNew = stayId === "new";
  const router = useRouter();
  const [stay, setStay] = useState<Stay | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [error, setError] = useState("");
  /** Option being edited: an id, "new", or null. */
  const [editingOpt, setEditingOpt] = useState<string | null>(null);
  const base = staysBase(eventId);

  // A new stay defaults to the event's own dates (night before check-out day).
  useEffect(() => {
    if (!isNew) return;
    void getEventById(eventId).then(({ data }) => {
      const start = data ? new Date(data.startDateTime) : new Date();
      const out = data ? new Date(data.endDateTime) : new Date(Date.now() + 86400000);
      out.setDate(out.getDate() + 1);
      setDraft({
        name: "",
        propertyType: "HOSTEL",
        description: "",
        address: "",
        city: "",
        mapUrl: "",
        amenities: "",
        houseRules: "",
        contactName: "",
        contactPhone: "",
        checkInFrom: toDay(start),
        checkOutUntil: toDay(out),
        checkInTime: "12:00 PM",
        checkOutTime: "10:00 AM",
        requireIdProof: true,
        paymentWindowHours: "48",
        isPublished: false,
      });
    });
  }, [isNew, eventId]);

  const take = useCallback((s: Stay) => {
    const d = toDraft(s);
    setStay(s);
    setDraft(d);
    setInitial(JSON.stringify(d));
  }, []);

  const reload = useCallback(async () => {
    const r = await getTeamStay(eventId, stayId);
    if (!r.ok) return setError(r.message);
    setStay(r.data);
  }, [eventId, stayId]);

  useEffect(() => {
    if (isNew) return;
    void getTeamStay(eventId, stayId).then((r) => (r.ok ? take(r.data) : setError(r.message)));
  }, [isNew, eventId, stayId, take]);

  const set = (patch: Partial<Draft>) => {
    setError("");
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const back = { href: base, label: "Stay" };
  const title = isNew ? "New stay" : stay?.name ?? "Stay";
  if (!draft) return <Page eventId={eventId} back={back} title={title} error={error} ready={false} />;

  const dirty = isNew || JSON.stringify(draft) !== initial;

  const save = async () => {
    if (!draft.name.trim()) return setError("Give the stay a name.");
    if (draft.checkOutUntil <= draft.checkInFrom) return setError("The last check-out day has to be after the first check-in day.");
    const hours = Number(draft.paymentWindowHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 240) return setError("Time to pay has to be 1 to 240 hours.");
    const body: StayInput = {
      name: draft.name.trim(),
      propertyType: draft.propertyType,
      description: draft.description.trim() || null,
      address: draft.address.trim() || null,
      city: draft.city.trim() || null,
      mapUrl: draft.mapUrl.trim() || null,
      amenities: draft.amenities.split(",").map((a) => a.trim()).filter(Boolean),
      houseRules: draft.houseRules.trim() || null,
      contactName: draft.contactName.trim() || null,
      contactPhone: draft.contactPhone.trim() || null,
      checkInFrom: draft.checkInFrom,
      checkOutUntil: draft.checkOutUntil,
      checkInTime: draft.checkInTime.trim() || null,
      checkOutTime: draft.checkOutTime.trim() || null,
      requireIdProof: draft.requireIdProof,
      paymentWindowHours: hours,
      ...(isNew ? {} : { isPublished: draft.isPublished }),
    };
    setSaving(true);
    const res = isNew ? await createStay(eventId, body) : await updateStay(eventId, stayId, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    // A new stay opens straight away so options can be added.
    if (isNew) router.replace(`${base}/${res.data.id}`);
    else take(res.data);
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${stay?.name}? Its options and questions go too. A stay with bookings can only be hidden.`)) return;
    const res = await deleteStay(eventId, stayId);
    if (!res.ok) return setError(res.message);
    router.push(base);
  };

  const addPhotos = async (files: FileList | null) => {
    if (!stay || !files?.length) return;
    const room = STAY_GALLERY_MAX - stay.galleryUrls.length;
    setBusyPhoto(true);
    let gallery = stay.galleryUrls;
    // One at a time: each upload returns the full list, so the last one wins cleanly.
    for (const f of Array.from(files).slice(0, room)) {
      const res = await addStayGalleryPhoto(eventId, stay.id, f);
      if (!res.ok) {
        setError(res.message);
        break;
      }
      gallery = res.data.galleryUrls;
    }
    setBusyPhoto(false);
    setStay((s) => (s ? { ...s, galleryUrls: gallery } : s));
  };

  const removePhoto = async (url: string) => {
    if (!stay || !window.confirm("Remove this photo? Guests will no longer see it.")) return;
    const res = await removeStayGalleryPhoto(eventId, stay.id, url);
    if (!res.ok) return setError(res.message);
    setStay((s) => (s ? { ...s, galleryUrls: res.data.galleryUrls } : s));
  };

  const questionStore: QuestionStore | null = stay
    ? {
        create: (b) => asStore(createStayQuestion(eventId, stay.id, stayBody(b))),
        update: (id, b) => asStore(updateStayQuestion(eventId, stay.id, id, stayBody(b))),
        remove: (id) => asStore(deleteStayQuestion(eventId, stay.id, id)),
      }
    : null;

  return (
    <Page
      eventId={eventId}
      back={back}
      title={title}
      error={error}
      ready
      actions={
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : isNew ? "Create stay" : "Save changes"}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {stay && (
            <ImageUploadCard
              title="Cover photo"
              imageUrl={stay.coverImageUrl}
              aspectClassName="aspect-[16/9]"
              cropAspect={16 / 9}
              onUpload={async (file) => {
                const res = await uploadStayCover(eventId, stay.id, file);
                return res.ok ? { url: res.data.coverImageUrl, error: null } : { url: null, error: res.message };
              }}
              onUploaded={(url) => setStay((s) => (s ? { ...s, coverImageUrl: url } : s))}
            />
          )}
          {stay && (
            <FormCard title="Gallery" description={`Up to ${STAY_GALLERY_MAX} photos guests see when they request a bed.`}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {stay.galleryUrls.map((url) => (
                  <div key={url} className="group relative aspect-square overflow-hidden rounded-md bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => void removePhoto(url)}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {stay.galleryUrls.length < STAY_GALLERY_MAX && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted">
                    <Plus className="h-5 w-5" />
                    {busyPhoto ? "Uploading…" : "Photos"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      className="sr-only"
                      disabled={busyPhoto}
                      onChange={(e) => {
                        void addPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </FormCard>
          )}
          <FormCard title="Property">
            <Field label="Name">
              <Input value={draft.name} placeholder="Boys Hostel, Block C" onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Type">
              <Chips options={TYPES} value={draft.propertyType} onChange={(v) => set({ propertyType: v })} />
            </Field>
            <Field label="About (optional)">
              <Textarea value={draft.description} placeholder="Walking distance from the venue, shared rooms…" onChange={(e) => set({ description: e.target.value })} />
            </Field>
          </FormCard>
          <FormCard title="Where">
            <Field label="Address">
              <Textarea value={draft.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City">
                <Input value={draft.city} placeholder="Hyderabad" onChange={(e) => set({ city: e.target.value })} />
              </Field>
              <Field label="Map link (optional)">
                <Input type="url" value={draft.mapUrl} placeholder="https://maps.app.goo.gl/…" onChange={(e) => set({ mapUrl: e.target.value })} />
              </Field>
            </div>
          </FormCard>
        </div>

        <div className="space-y-6">
          <FormCard title="When">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First check-in">
                <Input type="date" value={draft.checkInFrom} onChange={(e) => set({ checkInFrom: e.target.value })} />
              </Field>
              <Field label="Last check-out">
                <Input type="date" value={draft.checkOutUntil} min={draft.checkInFrom} onChange={(e) => set({ checkOutUntil: e.target.value })} />
              </Field>
              <Field label="Check-in time">
                <Input value={draft.checkInTime} placeholder="12:00 PM" onChange={(e) => set({ checkInTime: e.target.value })} />
              </Field>
              <Field label="Check-out time">
                <Input value={draft.checkOutTime} placeholder="10:00 AM" onChange={(e) => set({ checkOutTime: e.target.value })} />
              </Field>
            </div>
          </FormCard>
          <FormCard title="Details for guests">
            <Field label="Amenities, separated by commas">
              <Input value={draft.amenities} placeholder="Wi-Fi, Hot water, Mess, Lockers" onChange={(e) => set({ amenities: e.target.value })} />
            </Field>
            <Field label="House rules (optional)">
              <Textarea value={draft.houseRules} onChange={(e) => set({ houseRules: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name (optional)">
                <Input value={draft.contactName} onChange={(e) => set({ contactName: e.target.value })} />
              </Field>
              <Field label="Contact phone (optional)">
                <Input type="tel" value={draft.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
              </Field>
            </div>
          </FormCard>
          <FormCard title="Booking">
            <Toggle
              label="Ask every guest for a photo ID"
              hint="College or government ID, uploaded privately. Only your team can open it."
              checked={draft.requireIdProof}
              onChange={(v) => set({ requireIdProof: v })}
            />
            <Field label="Hours to pay after approval">
              <Input inputMode="numeric" value={draft.paymentWindowHours} className="max-w-32" onChange={(e) => set({ paymentWindowHours: e.target.value })} />
            </Field>
            {!isNew && (
              <Toggle
                label="Published"
                hint="Registered attendees can see and request this stay."
                checked={draft.isPublished}
                onChange={(v) => set({ isPublished: v })}
              />
            )}
          </FormCard>
        </div>
      </div>

      {stay ? (
        <>
          <ListGroup
            title="Rooms and beds"
            action={
              editingOpt !== "new" ? (
                <Button size="sm" variant="outline" onClick={() => setEditingOpt("new")}>
                  Add
                </Button>
              ) : undefined
            }
          >
            {stay.options.length === 0 && editingOpt !== "new" && <ListRow label="Add what guests can book" onClick={() => setEditingOpt("new")} />}
            {stay.options.map((o) =>
              editingOpt === o.id ? (
                <OptionForm
                  key={o.id}
                  eventId={eventId}
                  stayId={stay.id}
                  option={o}
                  onDone={(s) => {
                    setEditingOpt(null);
                    if (s) setStay(s);
                  }}
                />
              ) : (
                <ListRow
                  key={o.id}
                  label={o.name}
                  sublabel={`${o.totalBeds} beds · ${o.bedsLeft ?? o.totalBeds} free on the busiest night · ${GENDER_LABELS[o.gender]}${
                    o.price ? ` · ${PAYMENT_LABELS[o.paymentMode]}` : ""
                  }`}
                  value={o.isActive ? priceLabel(o) : "Off"}
                  onClick={() => setEditingOpt(o.id)}
                />
              )
            )}
            {editingOpt === "new" && (
              <OptionForm
                eventId={eventId}
                stayId={stay.id}
                option={null}
                onDone={(s) => {
                  setEditingOpt(null);
                  if (s) setStay(s);
                }}
              />
            )}
          </ListGroup>

          <FormCard title="Questions" description="Name, phone, gender, arrival time and an emergency contact are always asked.">
            {questionStore && (
              <FormFieldsManager
                eventId={eventId}
                isGroup={false}
                fields={stay.questions.map((q) => ({ ...q, perGroup: false }))}
                store={questionStore}
                onChanged={reload}
              />
            )}
          </FormCard>

          <Button variant="outline" className="text-destructive" onClick={remove}>
            <Trash className="h-4 w-4" weight="bold" /> Delete stay
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Create the stay, then add its rooms and beds. It stays hidden until you publish it.</p>
      )}
    </Page>
  );
}
