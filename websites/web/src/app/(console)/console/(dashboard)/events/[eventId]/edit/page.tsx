"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarBlank,
  MapPin,
  GlobeSimple,
  Users,
  Tag,
  X,
  ImageSquare,
  Spinner,
  Check,
  Sparkle,
} from "@unifesto/unicon/react";
import Cropper, { Point, Area } from "react-easy-crop";
import {
  getEventById,
  updateEvent,
  uploadEventCover,
  type EventType,
  type RegistrationType,
  type EventVisibility,
  type UpdateEventPayload,
  type Event,
} from "@/console/lib/api/events-api";
import { getCategories, type Category } from "@/console/lib/api/categories-api";
import {
  EVENT_TYPES,
  VISIBILITY_OPTIONS,
  INDIAN_STATES,
  toLocalDatetime,
  toIso,
} from "@/console/lib/constants/event-form";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { PlaceSearch } from "@/console/components/events/PlaceSearch";
import { AiDraftPanel } from "@/console/components/events/AiDraftPanel";
import type { PickedPlace } from "@/console/lib/googlePlaces";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Badge } from "@/console/components/ui/badge";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

interface FormState {
  title: string;
  slug: string;
  description: string;
  type: EventType;
  registrationType: RegistrationType;
  visibility: EventVisibility;
  startDateTime: string;
  endDateTime: string;
  venueName: string;
  venueAddress: string;
  city: string;
  state: string;
  /** Exact venue pin from Places search; null when typed by hand. */
  latitude: number | null;
  longitude: number | null;
  onlineUrl: string;
  onlinePlatform: string;
  category: string;
}

/**
 * Filter raw keystrokes into a valid URL slug as the organiser types (strict).
 *
 * Lowercases, turns runs of whitespace into a single hyphen, drops anything
 * that isn't a letter/number/hyphen, then collapses repeated hyphens and trims
 * any leading hyphen — so the live preview is always valid bar one case. The
 * one thing NOT trimmed here is a *trailing* hyphen: removing it on every
 * keystroke would make hyphens untypeable ("a-" → "a" before you reach "b").
 * `finalizeSlug` (run on blur) drops the trailing hyphen once editing pauses.
 */
function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");
}

/** Settle a slug to a fully valid form once the field loses focus. */
function finalizeSlug(slug: string): string {
  return slug.replace(/-+$/, "");
}

/**
 * Helper to create a cropped image from canvas
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Canvas is empty"));
      }
    }, "image/jpeg", 0.95);
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

export default function EditEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  
  // Cropper state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);

  // Load event and categories
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [eventRes, categoriesRes] = await Promise.all([
        getEventById(eventId),
        getCategories(),
      ]);

      if (!active) return;

      if (eventRes.error || !eventRes.data) {
        setError(eventRes.error?.message || "Event not found");
        setLoading(false);
        return;
      }

      const evt = eventRes.data;
      setEvent(evt);
      setTags(evt.tags || []);
      setCoverUrl(evt.coverImageUrl ?? null);

      // Initialize form with event data
      setForm({
        title: evt.title || "",
        slug: evt.slug || "",
        description: evt.description || "",
        type: evt.type || "IN_PERSON",
        registrationType: evt.registrationType || "RSVP",
        visibility: evt.visibility || "PUBLIC",
        startDateTime: toLocalDatetime(evt.startDateTime),
        endDateTime: toLocalDatetime(evt.endDateTime),
        venueName: evt.venueName || "",
        venueAddress: evt.venueAddress || "",
        city: evt.city || "",
        state: evt.state || "",
        latitude: evt.latitude ?? null,
        longitude: evt.longitude ?? null,
        onlineUrl: evt.onlineUrl || "",
        onlinePlatform: evt.onlinePlatform || "",
        category: evt.category || "",
      });

      if (categoriesRes.data) {
        setCategories(categoriesRes.data);
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [eventId]);

  const showVenue = form?.type === "IN_PERSON" || form?.type === "HYBRID";
  const showOnline = form?.type === "ONLINE" || form?.type === "HYBRID";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  // A picked place fills the venue and pins exact coordinates.
  const pickPlace = (p: PickedPlace) =>
    setForm((f) =>
      f
        ? {
            ...f,
            venueName: p.name,
            venueAddress: p.address,
            city: p.city || f.city,
            state: p.state || f.state,
            latitude: p.latitude,
            longitude: p.longitude,
          }
        : f
    );
  // Hand-editing where the venue is makes the saved pin stale, so drop it.
  // (Renaming the venue keeps the pin.)
  const setLocationField = (key: "venueAddress" | "city" | "state", value: string) =>
    setForm((f) => (f ? { ...f, [key]: value, latitude: null, longitude: null } : f));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) =>
    setTags((prev) => prev.filter((x) => x !== t));

  const validationError = useMemo(() => {
    if (!form) return "";
    if (!form.title.trim()) return "Give your event a title.";
    if (!form.slug.trim()) return "Give your event a URL slug.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug))
      return "The slug may only use lowercase letters, numbers and single hyphens.";
    if (!form.startDateTime) return "Pick a start date and time.";
    if (!form.endDateTime) return "Pick an end date and time.";
    if (new Date(form.endDateTime) <= new Date(form.startDateTime))
      return "The end time must be after the start time.";
    if (showVenue && !form.venueName.trim())
      return "Add a venue name for in-person events.";
    if (showOnline && !form.onlineUrl.trim())
      return "Add a joining link for online events.";
    return "";
  }, [form, showVenue, showOnline]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5MB or smaller.");
      return;
    }

    // Convert file to data URL for cropper
    const reader = new FileReader();
    reader.onload = () => {
      setImageToCrop(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCrop = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    setCropping(true);
    setError("");

    try {
      // Get cropped image blob
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);
      
      // Create file from blob
      const croppedFile = new File([croppedBlob], "banner.jpg", {
        type: "image/jpeg",
      });

      // Upload cropped image
      setUploadingCover(true);
      const { data, error: uploadError } = await uploadEventCover(
        eventId,
        croppedFile
      );
      setUploadingCover(false);

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      if (data) {
        setCoverUrl(data.coverImageUrl);
      }

      // Close dialog and reset state
      setCropDialogOpen(false);
      setImageToCrop(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to crop image");
    } finally {
      setCropping(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    const payload: UpdateEventPayload = {
      title: form.title.trim(),
      // Only send the slug when it actually changed — an unchanged slug is a
      // no-op on the backend, but skipping it keeps the payload honest and
      // avoids a needless uniqueness check.
      ...(event && form.slug !== event.slug ? { slug: form.slug.trim() } : {}),
      description: form.description.trim() || null,
      type: form.type,
      registrationType: form.registrationType,
      visibility: form.visibility,
      startDateTime: toIso(form.startDateTime),
      endDateTime: toIso(form.endDateTime),
      tags,
      category: form.category || null,
      ...(showVenue
        ? {
            venueName: form.venueName.trim() || null,
            venueAddress: form.venueAddress.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            // Always sent on edit: a number pins, null clears a removed pin.
            latitude: form.latitude,
            longitude: form.longitude,
          }
        : {}),
      ...(showOnline
        ? {
            onlineUrl: form.onlineUrl.trim() || null,
            onlinePlatform: form.onlinePlatform.trim() || null,
          }
        : {}),
    };

    const { data, error: apiError } = await updateEvent(eventId, payload);
    setSaving(false);

    if (apiError) {
      setError(apiError.message);
      return;
    }

    // Success - return to event overview
    router.push(`/console/events/${eventId}`);
    router.refresh();
    void data;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="space-y-4">
        <PageHeader title="Edit event" />
        <ErrorNotice message={error} />
        <Button onClick={() => router.push(`/console/events/${eventId}`)}>
          <ArrowLeft className="h-4 w-4" />
          Back to event
        </Button>
      </div>
    );
  }

  if (!form || !event) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Edit event"
        subtitle={event.title}
        actions={
          !aiOpen && (
            <Button variant="outline" onClick={() => setAiOpen(true)}>
              <Sparkle className="h-4 w-4" weight="fill" />
              Draft with AI
            </Button>
          )
        }
      />

      {error && <ErrorNotice message={error} />}

      {aiOpen && (
        <AiDraftPanel
          eventId={eventId}
          eventStart={event.startDateTime}
          agendaCount={event.agenda?.length ?? 0}
          faqCount={event.faqs?.length ?? 0}
          onUseDescription={(text) => set("description", text)}
          onClose={() => setAiOpen(false)}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner image */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Banner image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4">
            <div className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-lg border border-border bg-muted">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt="Event banner"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageSquare className="h-8 w-8" weight="duotone" />
                  <span className="text-sm">No banner yet</span>
                </div>
              )}
              {uploadingCover && (
                <div className="absolute inset-0 grid place-items-center bg-background/60">
                  <Spinner className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverChange}
                  disabled={uploadingCover}
                />
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted">
                  <ImageSquare className="h-4 w-4" />
                  {coverUrl ? "Replace image" : "Upload image"}
                </span>
              </label>
              <span className="text-xs text-muted-foreground">
                JPG/PNG, up to 5MB. Saved immediately.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Basics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Annual Tech Meetup 2025"
                maxLength={500}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL slug</Label>
              <div className="flex items-center rounded-md border border-input bg-transparent px-3 shadow-sm focus-within:ring-1 focus-within:ring-ring">
                <span className="shrink-0 text-sm text-muted-foreground">
                  unifesto.app/event/
                </span>
                <input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => set("slug", sanitizeSlug(e.target.value))}
                  onBlur={() => set("slug", finalizeSlug(form.slug))}
                  placeholder="annual-tech-meetup-2025"
                  maxLength={200}
                  className="flex-1 bg-transparent py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
                />
              </div>
              {event && form.slug !== event.slug && (
                <p className="text-xs text-warning">
                  Changing the slug changes this event&apos;s public link. Old
                  links, QR codes and shares pointing to the previous URL will
                  stop working.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Tell attendees what to expect…"
                rows={5}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={form.category || "none"}
                  onValueChange={(v) => set("category", v === "none" ? "" : v)}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Choose a category" />
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Add a tag and press Enter"
                  />
                  <Button aria-label="Add tag" type="button" variant="secondary" onClick={addTag}>
                    <Tag className="h-4 w-4" />
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tags.map((t) => (
                      <Badge
                        key={t}
                        variant="neutral"
                        className="gap-1 pr-1"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => removeTag(t)}
                          className="rounded-full p-0.5 hover:bg-foreground/10"
                          aria-label={`Remove ${t}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Format & schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Format &amp; schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="event-type">Event type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => set("type", v as EventType)}
              >
                <SelectTrigger id="event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Manage RSVP and ticket options from the Tickets &amp; RSVPs tabs.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start">Starts</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={form.startDateTime}
                  onChange={(e) => set("startDateTime", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">Ends</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={form.endDateTime}
                  onChange={(e) => set("endDateTime", e.target.value)}
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        {showVenue && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                Venue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-4">
              <div role="group" aria-labelledby="edit-venue-search" className="space-y-2">
                <Label id="edit-venue-search">Find the venue</Label>
                <PlaceSearch
                  onPick={pickPlace}
                  pinned={
                    form.latitude != null && form.longitude != null
                      ? { latitude: form.latitude, longitude: form.longitude }
                      : null
                  }
                  onClearPin={() => setForm((f) => (f ? { ...f, latitude: null, longitude: null } : f))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venueName">Venue name</Label>
                <Input
                  id="venueName"
                  value={form.venueName}
                  onChange={(e) => set("venueName", e.target.value)}
                  placeholder="e.g. Convention Center"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venueAddress">Address</Label>
                <Input
                  id="venueAddress"
                  value={form.venueAddress}
                  onChange={(e) => setLocationField("venueAddress", e.target.value)}
                  placeholder="Street address"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => setLocationField("city", e.target.value)}
                    placeholder="Mumbai"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Select
                    value={form.state}
                    onValueChange={(value) => setLocationField("state", value)}
                  >
                    <SelectTrigger id="state">
                      <SelectValue placeholder="Select a state" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIAN_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {showOnline && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GlobeSimple className="h-4 w-4" />
                Online
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="onlineUrl">Joining link</Label>
                <Input
                  id="onlineUrl"
                  type="url"
                  value={form.onlineUrl}
                  onChange={(e) => set("onlineUrl", e.target.value)}
                  placeholder="https://zoom.us/j/…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onlinePlatform">Platform</Label>
                <Input
                  id="onlinePlatform"
                  value={form.onlinePlatform}
                  onChange={(e) => set("onlinePlatform", e.target.value)}
                  placeholder="Zoom, Google Meet, …"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Visibility */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility</Label>
              <Select
                value={form.visibility}
                onValueChange={(v) =>
                  set("visibility", v as EventVisibility)
                }
              >
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(`/console/events/${eventId}`)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      {/* Image Crop Dialog */}
      <Dialog open={cropDialogOpen} onOpenChange={setCropDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crop Banner Image</DialogTitle>
          </DialogHeader>
          <div className="relative h-[400px] w-full bg-black">
            {imageToCrop && (
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={4 / 3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="zoom">Zoom</Label>
            <input
              id="zoom"
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCropDialogOpen(false);
                setImageToCrop(null);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
                setCroppedAreaPixels(null);
              }}
              disabled={cropping}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApplyCrop}
              disabled={cropping || !croppedAreaPixels}
            >
              {cropping ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Apply Crop
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
