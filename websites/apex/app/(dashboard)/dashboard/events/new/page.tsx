"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarBlank,
  MapPin,
  GlobeSimple,
  Users,
  Tag,
  X,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  createEvent,
  type EventType,
  type RegistrationType,
  type EventVisibility,
  type CreateEventPayload,
} from "@/lib/api/events-api";
import { getCategories, type Category } from "@/lib/api/categories-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "IN_PERSON", label: "In person" },
  { value: "ONLINE", label: "Online" },
  { value: "HYBRID", label: "Hybrid" },
];

const REGISTRATION_TYPES: {
  value: RegistrationType;
  label: string;
}[] = [
  { value: "RSVP", label: "RSVP (free registration)" },
  { value: "PAID", label: "Paid (ticketed)" },
];

const VISIBILITY_OPTIONS: {
  value: EventVisibility;
  label: string;
  hint: string;
}[] = [
  { value: "PUBLIC", label: "Public", hint: "Anyone can discover it" },
  {
    value: "SPACE_ONLY",
    label: "Space only",
    hint: "Only members of your space",
  },
  { value: "PRIVATE", label: "Private", hint: "Only people with the link" },
];

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

interface FormState {
  title: string;
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
  onlineUrl: string;
  onlinePlatform: string;
  category: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  type: "IN_PERSON",
  registrationType: "RSVP",
  visibility: "PUBLIC",
  startDateTime: "",
  endDateTime: "",
  venueName: "",
  venueAddress: "",
  city: "",
  state: "",
  onlineUrl: "",
  onlinePlatform: "",
  category: "",
};

/** Convert a `datetime-local` value (local time) into an ISO string. */
function toIso(local: string): string {
  // `new Date("2024-12-25T10:00")` is parsed as local time by the browser.
  return new Date(local).toISOString();
}

export default function CreateEventPage() {
  const router = useRouter();
  const { role, currentSpace, loading: sessionLoading } = useSession();
  const isAdmin = role === "platform_admin";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getCategories().then(({ data }) => {
      if (active && data) setCategories(data);
    });
    return () => {
      active = false;
    };
  }, []);

  const showVenue = form.type === "IN_PERSON" || form.type === "HYBRID";
  const showOnline = form.type === "ONLINE" || form.type === "HYBRID";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) =>
    setTags((prev) => prev.filter((x) => x !== t));

  const validationError = useMemo(() => {
    if (!form.title.trim()) return "Give your event a title.";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!currentSpace) {
      setError("Select a space before creating an event.");
      return;
    }
    setSaving(true);
    setError("");

    const payload: CreateEventPayload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      registrationType: form.registrationType,
      visibility: form.visibility,
      startDateTime: toIso(form.startDateTime),
      endDateTime: toIso(form.endDateTime),
      tags: tags.length ? tags : undefined,
      category: form.category || undefined,
      spaceId: currentSpace.id,
      ...(showVenue
        ? {
            venueName: form.venueName.trim() || undefined,
            venueAddress: form.venueAddress.trim() || undefined,
            city: form.city.trim() || undefined,
            state: form.state.trim() || undefined,
          }
        : {}),
      ...(showOnline
        ? {
            onlineUrl: form.onlineUrl.trim() || undefined,
            onlinePlatform: form.onlinePlatform.trim() || undefined,
          }
        : {}),
    };

    const { data, error: apiError } = await createEvent(payload);
    setSaving(false);

    if (apiError) {
      setError(apiError.message);
      return;
    }
    // Draft created — return to the events list.
    router.push("/dashboard/events");
    router.refresh();
    void data;
  };

  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Create event" subtitle="Loading…" />
      </div>
    );
  }

  // Only organisers with a selected space can create events.
  if (isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Create event" />
        <EmptyState
          icon={CalendarBlank}
          title="Admins can't create events"
          description="Events are created by space organisers. Switch to an organiser account to create one."
        />
      </div>
    );
  }

  if (!currentSpace) {
    return (
      <div className="space-y-6">
        <PageHeader title="Create event" />
        <EmptyState
          icon={CalendarBlank}
          title="No space selected"
          description="Choose a space from the switcher before creating an event."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/events")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <PageHeader
        title="Create event"
        subtitle={`Drafting in ${currentSpace.name}`}
      />

      {error && <ErrorNotice message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <Label>Category</Label>
                <Select
                  value={form.category || "none"}
                  onValueChange={(v) => set("category", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
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
                  <Button type="button" variant="secondary" onClick={addTag}>
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
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Event type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => set("type", v as EventType)}
                >
                  <SelectTrigger>
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
              </div>

              <div className="space-y-2">
                <Label>Registration</Label>
                <Select
                  value={form.registrationType}
                  onValueChange={(v) =>
                    set("registrationType", v as RegistrationType)
                  }
                  disabled
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGISTRATION_TYPES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <CardContent className="space-y-4">
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
                  onChange={(e) => set("venueAddress", e.target.value)}
                  placeholder="Street address"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Mumbai"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Select
                    value={form.state}
                    onValueChange={(value) => set("state", value)}
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
            <CardContent className="space-y-4">
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
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={form.visibility}
                onValueChange={(v) =>
                  set("visibility", v as EventVisibility)
                }
              >
                <SelectTrigger>
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
            onClick={() => router.push("/dashboard/events")}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create draft event"}
          </Button>
        </div>
      </form>
    </div>
  );
}
