/**
 * Admin Users API — platform staff surface. Backed by `/admin/users`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

/** User shape returned by the list endpoint (`GET /admin/users`). */
export interface User {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
  emailVerified: boolean;
  mobileNumber: string | null;
  mobileVerified: boolean;
  avatarUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  appVersion: string | null;
  appPlatform: string | null;
  appVersionLastReportedAt: string | null;
  /** Last authenticated request from any client; null = not seen since tracking began. */
  lastSeenAt: string | null;
  roles: string[];
  identitiesCount: number;
  /** OneSignal devices; reachable = linked to the user AND push permission on. */
  pushDevices: { total: number; reachable: number };
  createdAt: string;
  updatedAt: string;
}

/** Identity linked to an account. */
export interface UserIdentity {
  id: string;
  provider: string;
  email: string | null;
  emailVerified: boolean;
  isPrimary: boolean;
  createdAt?: string;
}

/** Role assignment as returned by the detail endpoint. */
export interface UserRoleAssignment {
  id: string;
  code: string;
  name: string;
  scope: string;
  spaceId: string | null;
  spaceName: string | null;
  spaceSlug: string | null;
  assignedBy: {
    id: string;
    fullName: string | null;
    username: string | null;
  } | null;
  assignedAt: string;
}

/** A OneSignal push subscription (app install) linked to the account. */
export interface UserPushDevice {
  id: string;
  /** OneSignal push subscription id — the "device id". */
  subscriptionId: string;
  platform: string;
  deviceModel: string | null;
  appVersion: string | null;
  /** Push permission granted + subscribed on the device. */
  optedIn: boolean;
  /** When the backend linked OneSignal external_id = user id; null = not linked. */
  linkedAt: string | null;
  linkError: string | null;
  lastSeenAt: string;
  createdAt: string;
}

/** Full user shape returned by the detail endpoint (`GET /admin/users/:id`). */
export interface UserDetail {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
  emailVerified: boolean;
  mobileNumber: string | null;
  mobileVerified: boolean;
  avatarUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  appVersion: string | null;
  appPlatform: string | null;
  appVersionLastReportedAt: string | null;
  /** Last authenticated request from any client; null = not seen since tracking began. */
  lastSeenAt: string | null;
  roles: UserRoleAssignment[];
  identities: UserIdentity[];
  pushDevices: UserPushDevice[];
  createdAt: string;
  updatedAt: string;
}

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface UserListResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** List users with pagination and search. */
export async function getUsers(
  params?: UserListParams
): Promise<{ data: UserListResponse | null; error: ApiError | null }> {
  return apiCall<UserListResponse>(
    backendClient.get("/admin/users", { params })
  );
}

/** Fetch a single user by ID. */
export async function getUser(
  id: string
): Promise<{ data: { user: UserDetail } | null; error: ApiError | null }> {
  return apiCall<{ user: UserDetail }>(backendClient.get(`/admin/users/${id}`));
}

/** Editable profile fields for the admin update endpoint. */
/** null clears an optional field; name and username can't be cleared. */
export interface UpdateUserPayload {
  fullName?: string;
  username?: string;
  bio?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}

/** Update a user's profile by ID. */
export async function updateUser(
  id: string,
  payload: UpdateUserPayload
): Promise<{ data: { user: UserDetail; message: string } | null; error: ApiError | null }> {
  return apiCall<{ user: UserDetail; message: string }>(
    backendClient.patch(`/admin/users/${id}`, payload)
  );
}

/** Make a user an Employee (enabled) or remove it. ADMIN only. */
export async function setEmployee(
  id: string,
  enabled: boolean
): Promise<{ data: { userId: string; employee: boolean } | null; error: ApiError | null }> {
  return apiCall<{ userId: string; employee: boolean }>(
    backendClient.put(`/admin/users/${id}/employee`, { enabled })
  );
}

/** Add or replace a user's avatar (admin). Returns the new hosted URL. */
export async function uploadUserAvatar(
  id: string,
  file: File
): Promise<{ data: { avatarUrl: string } | null; error: ApiError | null }> {
  const formData = new FormData();
  formData.append("avatar", file);
  return apiCall<{ avatarUrl: string }>(
    backendClient.post(`/admin/users/${id}/avatar`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

/** Remove a user's avatar (admin). */
export async function removeUserAvatar(
  id: string
): Promise<{ data: { avatarUrl: null } | null; error: ApiError | null }> {
  return apiCall<{ avatarUrl: null }>(
    backendClient.delete(`/admin/users/${id}/avatar`)
  );
}
