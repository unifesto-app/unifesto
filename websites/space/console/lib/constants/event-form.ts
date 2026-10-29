/**
 * Shared option lists for the event create/edit forms.
 *
 * These lived inline in the edit page; the create wizard needs the same lists,
 * so they now sit here as a single source of truth for both surfaces.
 */

import type { EventType, EventVisibility } from "@/console/lib/api/events-api";

export const EVENT_TYPES: { value: EventType; label: string; hint: string }[] = [
  { value: "IN_PERSON", label: "In person", hint: "At a physical venue" },
  { value: "ONLINE", label: "Online", hint: "Streamed or on a call" },
  { value: "HYBRID", label: "Hybrid", hint: "Both a venue and a link" },
];

export const VISIBILITY_OPTIONS: {
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

export const INDIAN_STATES = [
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

/** Convert an ISO string to a `datetime-local` value (YYYY-MM-DDTHH:mm, local). */
export function toLocalDatetime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/** Convert a `datetime-local` value (local time) into an ISO string. */
export function toIso(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}
