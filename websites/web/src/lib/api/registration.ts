import { apiBase, withInternal } from "@/lib/api/internal";
import { mapEvent, type Event } from "@/lib/api/events";

/**
 * Free registration on the web (K10 slice 1). Same backend calls as the app:
 * email OTP sign-in (`/auth/email` → `/auth/email/verify`, then WhatsApp OTP
 * for a new account) and `POST /events/:id/register/create-order`, which
 * completes a ₹0 ticket on the spot with no Razorpay order.
 */

const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

/** A ticket type as the event detail payload sends it (visible + active only). */
export interface RegTicket {
  id: string;
  name: string;
  description: string | null;
  kind: "RSVP" | "INDIVIDUAL" | "GROUP";
  price: number;
  totalQuantity: number | null;
  soldCount: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  waitlistEnabled: boolean;
}

export type FieldType =
  | "TEXT" | "TEXTAREA" | "SELECT" | "RADIO" | "CHECKBOX" | "NUMBER" | "EMAIL" | "PHONE"
  | "DATE" | "URL" | "YES_NO" | "FILE" | "SECTION" | "STATE" | "RATING";

/** A registration question (backend EventFormField). Answers are keyed by `id`. */
export interface FormField {
  id: string;
  ticketTypeId: string | null;
  label: string;
  type: FieldType;
  options: string[];
  isRequired: boolean;
  order: number;
  helpText: string | null;
  config: { minLength?: number; maxLength?: number; min?: number; max?: number; minDate?: string; maxDate?: string; scale?: 5 | 10 } | null;
  showIf: { fieldId: string; anyOf: string[] } | null;
}

/** Server-side: the event plus the raw tickets and questions the form needs. */
export async function getRegistrationForm(
  slug: string,
): Promise<{ event: Event; tickets: RegTicket[]; fields: FormField[] } | null> {
  const res = await fetch(`${apiBase(PUBLIC_API)}/events/${encodeURIComponent(slug)}`, withInternal({ cache: "no-store" }));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error fetching event: ${res.status}`);
  const raw = await res.json();
  const event = mapEvent(raw?.id ? raw : null);
  if (!event) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw backend JSON
  const tickets: RegTicket[] = (raw.ticketTypes ?? []).map((t: Record<string, any>) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    kind: t.kind,
    price: Number(t.price) || 0,
    totalQuantity: t.totalQuantity ?? null,
    soldCount: Number(t.soldCount ?? 0),
    saleStartsAt: t.saleStartsAt ?? null,
    saleEndsAt: t.saleEndsAt ?? null,
    waitlistEnabled: Boolean(t.waitlistEnabled),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw backend JSON
  const fields: FormField[] = (raw.formFields ?? []).map((f: Record<string, any>) => ({
    id: f.id,
    ticketTypeId: f.ticketTypeId ?? null,
    label: f.label,
    type: f.type,
    options: (f.options as string[]) ?? [],
    isRequired: Boolean(f.isRequired),
    order: Number(f.order ?? 0),
    helpText: f.helpText ?? null,
    config: f.config ?? null,
    showIf: f.showIf ?? null,
  }));
  return { event, tickets, fields };
}

/** Thrown for a non-2xx response, carrying the backend's message and status. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PUBLIC_API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Network error. Please try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new ApiError(msg || "Something went wrong. Please try again.", res.status);
  }
  return data as T;
}

export interface AuthResponse {
  accessToken: string;
  requiresMobileVerification?: boolean;
  tempToken?: string;
  user?: { fullName?: string | null };
}

export const sendEmailCode = (email: string) => call("POST", "/auth/email", { email });
export const verifyEmailCode = (email: string, otp: string) =>
  call<AuthResponse>("POST", "/auth/email/verify", { email, otp });
export const sendPhoneCode = (mobileNumber: string, tempToken: string) =>
  call("POST", "/auth/mobile/send-otp", { mobileNumber, tempToken });
export const verifyPhoneCode = (mobileNumber: string, otp: string, tempToken: string) =>
  call<AuthResponse>("POST", "/auth/verify-mobile", { mobileNumber, otp, tempToken });
export const saveName = (fullName: string, token: string) => call("PATCH", "/users/me", { fullName }, token);

/** Z11: record "I am 18 or older" (stamped once server-side). */
export const confirmAge = (token: string) => call("PATCH", "/users/me", { ageConfirmed: true }, token);

/** My live registrations for this event (empty when I have none). */
export const myRegistrations = (eventId: string, token: string) =>
  call<{ id: string }[]>("GET", `/events/${eventId}/my-registrations`, undefined, token);

export type RegisterResult =
  | { isWaitlisted: true }
  | { isWaitlisted?: false; registrationId: string; razorpayOrderId: string | null };

/** The app's checkout call. A ₹0 ticket is registered immediately. */
export const registerFree = (
  eventId: string,
  token: string,
  body: { ticketTypeId: string; formResponses: Record<string, unknown>; utmSource?: string; utmMedium?: string; utmCampaign?: string },
) => call<RegisterResult>("POST", `/events/${eventId}/register/create-order`, { ...body, quantity: 1 }, token);

/** Answer as the strings a show-if condition compares against (backend answerTokens). */
function answerTokens(f: FormField, v: unknown): string[] {
  if (v === true) return ["Yes"];
  if (v === false) return f.type === "YES_NO" ? ["No"] : [];
  if (Array.isArray(v)) return v.map(String);
  return typeof v === "string" && v ? [v] : [];
}

/** Questions the attendee sees given their answers (mirrors backend visibleFieldIds). */
export function visibleFieldIds(fields: FormField[], answers: Record<string, unknown>): Set<string> {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const visible = new Set<string>();
  for (const f of [...fields].sort((a, b) => a.order - b.order)) {
    const parent = f.showIf ? byId.get(f.showIf.fieldId) : undefined;
    if (!f.showIf || !parent) visible.add(f.id);
    else if (visible.has(parent.id) && answerTokens(parent, answers[parent.id]).some((t) => f.showIf!.anyOf.includes(t)))
      visible.add(f.id);
  }
  return visible;
}

/** The 28 states and 8 union territories (backend INDIAN_STATES_AND_UTS). */
export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];
