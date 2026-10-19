/**
 * Spaces API — organiser surface.
 * The NestJS backend models these as Spaces under `/spaces`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";
import type {
  SpaceWithHierarchy,
  SpaceKind,
  SpaceStatus,
  SpaceRoleCode,
} from "@/lib/types/rbac";

/** Get a single space by ID. */
export async function getSpace(
  id: string
): Promise<{ data: SpaceWithHierarchy | null; error: ApiError | null }> {
  const { data, error } = await apiCall<SpaceWithHierarchy & { type?: string }>(
    backendClient.get(`/spaces/${id}`)
  );
  if (!data) return { data: null, error };
  // The backend's raw `type` field is the structural kind (SUPER/REGULAR),
  // which collides with the organiser-facing `SpaceType`. Surface it as
  // `spaceKind` so admin controls can read it without type conflicts.
  const rawKind = (data as { type?: string }).type;
  const spaceKind: SpaceKind | undefined =
    rawKind === "SUPER" || rawKind === "REGULAR" ? rawKind : undefined;
  // `GET /users/me/spaces` returns a flattened `userRole` ({ id, code, name }),
  // but `GET /spaces/:id` may return the raw membership record where the role
  // code is nested under `userRole.role.code`. Normalize to the flat shape so
  // `isOrganiserRole(space.userRole?.code)` works regardless of which the
  // backend build sends.
  const rawUserRole = (data as { userRole?: unknown }).userRole as
    | { code?: string; name?: string; role?: { id?: string; code?: string; name?: string } }
    | null
    | undefined;
  const normalizedUserRole = rawUserRole
    ? {
        ...rawUserRole,
        code: rawUserRole.code ?? rawUserRole.role?.code,
        name: rawUserRole.name ?? rawUserRole.role?.name,
      }
    : rawUserRole;
  // `GET /spaces/:id` returns Prisma-shaped fields (camelCase, nested `_count`,
  // ISO `createdAt`/`updatedAt`, `status`, `approvedAt`, `parentSpaceId`).
  // The detail page reads the snake_case UI shape, so map them across. Only
  // fill fields that aren't already present so a future normalized backend
  // build keeps working.
  const raw = data as unknown as Record<string, unknown>;
  const count = (raw._count ?? {}) as {
    userRoles?: number;
    childSpaces?: number;
  };
  const statusVal = raw.status as string | undefined;
  const normalized: Record<string, unknown> = {
    ...raw,
    spaceKind,
    userRole: normalizedUserRole,
    member_count: raw.member_count ?? count.userRoles ?? 0,
    sub_org_count: raw.sub_org_count ?? count.childSpaces ?? 0,
    depth_level: raw.depth_level ?? (raw.parentSpaceId ? 1 : 0),
    created_at: raw.created_at ?? raw.createdAt,
    updated_at: raw.updated_at ?? raw.updatedAt,
    is_active: raw.is_active ?? statusVal === "ACTIVE",
    is_verified: Boolean(raw.verifiedAt),
  };
  return {
    data: normalized as unknown as SpaceWithHierarchy,
    error: null,
  };
}

/** A lightweight space result for pickers (co-host invite, etc.). */
export interface SpaceSearchResult {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

/**
 * Search active spaces by name/slug for pickers. Backed by
 * `GET /spaces?search=&status=ACTIVE`.
 */
export async function searchSpaces(
  query: string,
  limit = 8
): Promise<{ data: SpaceSearchResult[] | null; error: ApiError | null }> {
  const { data, error } = await apiCall<{
    spaces: Array<Record<string, unknown>>;
  }>(
    backendClient.get("/spaces", {
      params: { search: query, status: "ACTIVE", page: 1, limit },
    })
  );
  if (!data) return { data: null, error };
  const results: SpaceSearchResult[] = (data.spaces ?? []).map((raw) => ({
    id: raw.id as string,
    name: raw.name as string,
    slug: raw.slug as string,
    logo_url: (raw.logo_url ?? raw.logoUrl ?? null) as string | null,
  }));
  return { data: results, error: null };
}

/**
 * One node in a parent space's sub-space subtree, with its own rolled-up
 * activity counts. `depth` is hops from the parent (direct child = 1).
 */
export interface SubSpaceAnalyticsRow {
  id: string;
  name: string;
  slug: string;
  type: SpaceKind;
  status: SpaceStatus;
  parentSpaceId: string | null;
  depth: number;
  members: number;
  events: number;
  upcomingEvents: number;
  registrations: number;
  /** Net ticket revenue (PAID minus app fee, refunds excluded). */
  revenue: number;
}

/**
 * Aggregated activity for a parent space and everything beneath it, as
 * returned by `GET /spaces/:id/analytics`.
 */
export interface SubSpaceAnalytics {
  space: { id: string; name: string; slug: string; type: SpaceKind };
  totals: {
    subSpaces: number;
    maxDepth: number;
    members: number;
    events: number;
    upcomingEvents: number;
    registrations: number;
    /** Net ticket revenue across the whole subtree. */
    revenue: number;
  };
  eventsByStatus: Record<string, number>;
  subSpaces: SubSpaceAnalyticsRow[];
}

/**
 * Fetch rolled-up analytics for a parent (SUPER) space and its whole
 * sub-space subtree. Requires the caller to be a Space Admin
 * of the space (enforced server-side by SpaceRoleGuard).
 * Backed by `GET /spaces/:id/analytics`.
 */
export async function getSubSpaceAnalytics(
  spaceId: string
): Promise<{ data: SubSpaceAnalytics | null; error: ApiError | null }> {
  return apiCall<SubSpaceAnalytics>(
    backendClient.get(`/spaces/${spaceId}/analytics`)
  );
}

/** Space visibility as accepted by the backend (`SpaceVisibility`). */
export type SpaceVisibility = "PUBLIC" | "PRIVATE";

/** Editable fields on a space, mirroring the backend `UpdateSpaceDto`. */
export interface UpdateSpacePayload {
  name?: string;
  slug?: string;
  description?: string;
  websiteUrl?: string;
  city?: string;
  state?: string;
  country?: string;
  tags?: string[];
  visibility?: SpaceVisibility;
}

/**
 * Update a space's editable profile fields. Backed by `PATCH /spaces/:id`,
 * which is guarded by `SpaceRoleGuard` — allowed for platform admins and the
 * space's own Space Admins.
 */
export async function updateSpace(
  id: string,
  payload: UpdateSpacePayload
): Promise<{ data: SpaceWithHierarchy | null; error: ApiError | null }> {
  return apiCall<SpaceWithHierarchy>(
    backendClient.patch(`/spaces/${id}`, payload)
  );
}

/**
 * Upload a space logo. Backed by `POST /spaces/:id/logo` (multipart, field
 * `logo`), guarded by `SpaceRoleGuard` — allowed for platform admins and the
 * space's Space Admins.
 */
export async function uploadSpaceLogo(
  id: string,
  file: File
): Promise<{ data: { logoUrl: string } | null; error: ApiError | null }> {
  const formData = new FormData();
  formData.append("logo", file);
  return apiCall<{ logoUrl: string }>(
    backendClient.post(`/spaces/${id}/logo`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

/**
 * Upload a space banner. Backed by `POST /spaces/:id/banner` (multipart, field
 * `banner`), guarded by `SpaceRoleGuard`.
 */
export async function uploadSpaceBanner(
  id: string,
  file: File
): Promise<{ data: { bannerUrl: string } | null; error: ApiError | null }> {
  const formData = new FormData();
  formData.append("banner", file);
  return apiCall<{ bannerUrl: string }>(
    backendClient.post(`/spaces/${id}/banner`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

// ---------------------------------------------------------------------------
// Space members — view + manage the roster of a space.
// ---------------------------------------------------------------------------

/** Space-scoped role codes that a member can hold. */
export type SpaceMemberRoleCode = "SPACE_ADMIN" | "MEMBER";

/** A single member of a space (a UserRole row joined with user + role). */
export interface SpaceMember {
  /** UserRole assignment id — used for update/remove operations. */
  id: string;
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  role: {
    id: string;
    code: SpaceRoleCode;
    name: string;
  };
  createdAt: string;
}

export interface SpaceMemberListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: SpaceMemberRoleCode;
}

export interface SpaceMemberListResponse {
  members: SpaceMember[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * List members of a space with pagination and search.
 * Accessible to platform admins and the space's organiser team.
 * Backed by `GET /spaces/:id/members`.
 *
 * The endpoint may return either the paginated shape
 * (`{ members, pagination }`) or a bare `SpaceMember[]` array, depending on the
 * deployed backend version. This helper normalizes both: when a bare array is
 * returned, search/role filtering and pagination are applied client-side so the
 * UI behaves consistently.
 */
export async function getSpaceMembers(
  spaceId: string,
  params?: SpaceMemberListParams
): Promise<{ data: SpaceMemberListResponse | null; error: ApiError | null }> {
  const { data, error } = await apiCall<
    SpaceMemberListResponse | SpaceMember[]
  >(backendClient.get(`/spaces/${spaceId}/members`, { params }));

  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };

  // New backend: already paginated.
  if (!Array.isArray(data)) {
    return { data: data as SpaceMemberListResponse, error: null };
  }

  // Legacy backend: bare array — filter + paginate on the client.
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const term = params?.search?.trim().toLowerCase();

  let filtered = data as SpaceMember[];
  if (params?.role) {
    filtered = filtered.filter((m) => m.role?.code === params.role);
  }
  if (term) {
    filtered = filtered.filter((m) => {
      const u = m.user ?? {};
      return (
        (u.fullName ?? "").toLowerCase().includes(term) ||
        (u.username ?? "").toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term)
      );
    });
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const members = filtered.slice(start, start + limit);

  return {
    data: { members, pagination: { page, limit, total, totalPages } },
    error: null,
  };
}

/** A user that can be added to a space (from member-search). */
export interface AddableUser {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
}

/**
 * Search users who can be added to a space (excludes current members).
 * Backed by `GET /spaces/:id/member-search?q=`.
 */
export async function searchAddableUsers(
  spaceId: string,
  q: string
): Promise<{ data: { users: AddableUser[] } | null; error: ApiError | null }> {
  return apiCall<{ users: AddableUser[] }>(
    backendClient.get(`/spaces/${spaceId}/member-search`, { params: { q } })
  );
}

/**
 * Add a member to a space with a given role.
 * Backed by `POST /spaces/:id/members`.
 */
export async function addSpaceMember(
  spaceId: string,
  userId: string,
  role: SpaceMemberRoleCode
): Promise<{
  data: { message: string; member: SpaceMember } | null;
  error: ApiError | null;
}> {
  return apiCall<{ message: string; member: SpaceMember }>(
    backendClient.post(`/spaces/${spaceId}/members`, { userId, role })
  );
}

/**
 * Update a member's role within a space.
 * Backed by `PATCH /spaces/:id/members/:userRoleId`.
 */
export async function updateSpaceMemberRole(
  spaceId: string,
  userRoleId: string,
  role: SpaceMemberRoleCode
): Promise<{
  data: { message: string; member: SpaceMember } | null;
  error: ApiError | null;
}> {
  return apiCall<{ message: string; member: SpaceMember }>(
    backendClient.patch(`/spaces/${spaceId}/members/${userRoleId}`, { role })
  );
}

/**
 * Remove a member from a space.
 * Backed by `DELETE /spaces/:id/members/:userRoleId`.
 */
export async function removeSpaceMember(
  spaceId: string,
  userRoleId: string
): Promise<{ data: { message: string } | null; error: ApiError | null }> {
  return apiCall<{ message: string }>(
    backendClient.delete(`/spaces/${spaceId}/members/${userRoleId}`)
  );
}

/* -------------------------- ownership transfers --------------------------- */

export type OwnershipRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * A creator's request to hand their space to another member.
 *
 * Ownership is not a role, so it cannot go through the member-role editor —
 * that endpoint refuses to move the creator. It changes who the space bills to,
 * so an admin reviews it.
 */
export interface SpaceOwnershipRequest {
  id: string;
  spaceId: string;
  space?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  requestedBy: string;
  requester?: {
    id: string;
    fullName: string | null;
    username: string | null;
    mobileNumber?: string | null;
  };
  newOwnerId: string;
  newOwner?: {
    id: string;
    fullName: string | null;
    username: string | null;
    mobileNumber?: string | null;
  };
  reason: string;
  status: OwnershipRequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/**
 * Ask to transfer this space to another member. Creator only; the target must
 * already be a member. Takes effect only once an admin approves.
 */
export async function createOwnershipRequest(payload: {
  spaceId: string;
  newOwnerId: string;
  reason: string;
}): Promise<{ data: SpaceOwnershipRequest | null; error: ApiError | null }> {
  return apiCall<SpaceOwnershipRequest>(
    backendClient.post(`/spaces/ownership-requests`, payload)
  );
}

/** Transfers I raised, or that would hand a space to me. */
export async function getMyOwnershipRequests(
  spaceId?: string
): Promise<{ data: SpaceOwnershipRequest[] | null; error: ApiError | null }> {
  return apiCall<SpaceOwnershipRequest[]>(
    backendClient.get(`/spaces/ownership-requests/my`, {
      params: spaceId ? { spaceId } : undefined,
    })
  );
}

/** Hierarchy changes Unifesto reviews (backend `SubSpaceRequestType`). */
export type SubSpaceRequestType =
  | "JOIN_SUPER"
  | "CONVERT_AND_JOIN"
  | "CONVERT_TO_SUPER"
  | "CONVERT_TO_REGULAR"
  | "REMOVE_CHILD"
  | "REMOVE_PARENT";

/**
 * Ask Unifesto to change where a space sits in the hierarchy. Backed by
 * `POST /spaces/sub-space-requests`; it opens an Assist case for the reply.
 */
export async function createSubSpaceRequest(payload: {
  requestType: SubSpaceRequestType;
  targetSpaceId: string;
  subSpaceId?: string;
  reason?: string;
}): Promise<{ data: { id: string } | null; error: ApiError | null }> {
  return apiCall<{ id: string }>(
    backendClient.post("/spaces/sub-space-requests", payload)
  );
}
