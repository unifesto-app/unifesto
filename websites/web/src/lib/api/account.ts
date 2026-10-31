import { ApiError, call } from "@/lib/api/registration";
import { mapEvent, type Event } from "@/lib/api/events";

/* K19: the web account pages. The same endpoints the app uses. */

const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app";

export type Gender = "MALE" | "FEMALE" | "NON_BINARY" | "PREFER_NOT_TO_SAY";

export interface Me {
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  gender: Gender | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  mobileNumber: string;
  createdAt: string;
  /** Set while a deletion request is pending: when the account closes. */
  deletionScheduledFor: string | null;
}

/** null clears a field: the API skips validation for null and stores it. */
export type ProfilePatch = Partial<
  Pick<Me, "fullName" | "username" | "bio" | "gender" | "linkedinUrl" | "instagramUrl" | "githubUrl" | "websiteUrl">
>;

export const getMe = (token: string) => call<Me>("GET", "/users/me", undefined, token);
export const updateMe = (token: string, body: ProfilePatch) => call<Me>("PATCH", "/users/me", body, token);
export const checkUsername = (username: string) =>
  call<{ available: boolean }>("POST", "/users/check-username", { username });

/** JPG, PNG or WebP up to 5 MB (the API checks both too). */
export async function uploadAvatar(token: string, file: File): Promise<string> {
  const body = new FormData();
  body.append("avatar", file);
  const res = await fetch(`${PUBLIC_API}/users/me/avatar`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((Array.isArray(data?.message) ? data.message[0] : data?.message) || "Couldn't upload the photo.", res.status);
  return data.avatarUrl as string;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  registrationUpdates: boolean;
  emailEventReminders: boolean;
  emailNewEvents: boolean;
  promotions: boolean;
  /** null when there's no address on file to opt out of. */
  marketingEmail: boolean | null;
  marketingWhatsapp: boolean | null;
  spaceOptOuts: { spaceId: string; spaceName: string }[];
}

export const getNotificationSettings = (token: string) =>
  call<NotificationSettings>("GET", "/users/me/notification-settings", undefined, token);
export const updateNotificationSettings = (token: string, patch: Partial<NotificationSettings>) =>
  call<NotificationSettings>("PATCH", "/users/me/notification-settings", patch, token);
export const resubscribeToSpace = (token: string, spaceId: string) =>
  call<NotificationSettings>("DELETE", `/users/me/notification-settings/space-opt-outs/${spaceId}`, undefined, token);

/** Starts the 30-day grace period; the API refuses (409) while something blocks closing. */
export const requestDeletion = (token: string) =>
  call<{ deletionScheduledFor: string | null }>("DELETE", "/users/me", undefined, token);
export const cancelDeletion = (token: string) =>
  call<{ deletionScheduledFor: null }>("POST", "/users/me/deletion/cancel", undefined, token);

export async function getSavedEvents(token: string): Promise<Event[]> {
  const rows = await call<Record<string, unknown>[]>("GET", "/favorites", undefined, token);
  return rows.map((r) => mapEvent(r)).filter((e): e is Event => !!e);
}
export const unsaveEvent = (token: string, eventId: string) => call("DELETE", `/events/${eventId}/favorite`, undefined, token);

export interface MyCertificate {
  id: string;
  /** F2: issued but held until I give feedback; no files or code until then. */
  locked?: boolean;
  certificateNumber: string;
  verificationCode: string;
  pdfUrl: string | null;
  imageUrl: string | null;
  issuedAt: string;
  event: { id: string; title: string; slug: string };
}
export const getMyCertificates = (token: string) => call<MyCertificate[]>("GET", "/certificates/mine", undefined, token);

/** How I sign in: one row per provider and address. Pages group them by email, like the app. */
export interface Identity {
  id: string;
  provider: "EMAIL" | "GOOGLE" | "APPLE" | "PHONE";
  email: string | null;
  emailVerified: boolean;
  isPrimary: boolean;
}
export const getIdentities = (token: string) => call<Identity[]>("GET", "/users/me/identities", undefined, token);
/** The primary address gets my emails. */
export const makePrimary = (token: string, id: string) => call("PATCH", `/users/me/identities/${id}/primary`, undefined, token);
export const removeIdentity = (token: string, id: string) => call("DELETE", `/users/me/identities/${id}`, undefined, token);
/** Revokes every access and refresh token of mine, this browser's included. */
export const signOutEverywhere = (token: string) => call("POST", "/auth/logout-all", undefined, token);

/** A phone or browser signed in to my account. `current` is this browser. */
export interface LinkedDevice {
  id: string;
  name: string;
  kind: "app" | "browser";
  current: boolean;
  signedInAt: string;
  lastActiveAt: string;
}
export const getLinkedDevices = (token: string) => call<LinkedDevice[]>("GET", "/auth/sessions", undefined, token);
/** Signs that device out; a phone also stops getting my notifications. */
export const signOutDevice = (token: string, id: string) => call("DELETE", `/auth/sessions/${id}`, undefined, token);

/** One row per role I hold in a space (`GET /users/me/spaces`). */
export interface MySpace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  city: string | null;
  userRole: { code: string; name: string };
}
export const getMySpaces = (token: string) => call<MySpace[]>("GET", "/users/me/spaces", undefined, token);
export const leaveSpace = (token: string, spaceId: string) => call("POST", `/spaces/${spaceId}/leave`, undefined, token);

export interface SpaceRequest {
  id: string;
  name: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
}
export const getMySpaceRequests = (token: string) => call<SpaceRequest[]>("GET", "/spaces/my-requests", undefined, token);

/** Links an organiser made for me to share. Only partners have any. */
export interface PartnerLink {
  id: string;
  name: string;
  event: { slug: string; title: string; startDateTime: string; space: { name: string } | null };
  registrations: number;
  trackingUrl: string;
}
export const getMyPartnerLinks = (token: string) => call<PartnerLink[]>("GET", "/partner-links/mine", undefined, token);
export const getPartnerToday = (token: string, id: string) =>
  call<{ today: number }>("GET", `/partner-links/${id}/stats`, undefined, token).then((r) => r.today);
