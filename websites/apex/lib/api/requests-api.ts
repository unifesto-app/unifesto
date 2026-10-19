/**
 * Requests API — admin review surfaces.
 *
 * Three distinct queues, each backed by the NestJS `/spaces` controller:
 *   - Space requests      → new organisations awaiting approval.
 *   - Sub-space requests   → a space asking to join another as a sub-space.
 *   - Status requests      → a space asking to change its lifecycle state.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

/** A person attached to a request (applicant). */
export interface RequestUser {
  id: string;
  fullName: string | null;
  username: string | null;
  mobileNumber?: string | null;
  avatarUrl?: string | null;
  identities?: { email: string | null }[];
}

/** A lightweight space reference embedded in a request. */
export interface RequestSpace {
  id: string;
  name: string;
  slug: string;
  type?: string;
  status?: string;
  logoUrl?: string | null;
}

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/* -------------------------------------------------------------------------- */
/* Space requests (organisers requesting a new space)                         */
/* -------------------------------------------------------------------------- */

export interface SpaceRequest {
  id: string;
  name: string;
  description: string | null;
  type: string;
  visibility: string;
  city: string | null;
  state: string | null;
  country: string | null;
  tags: string[];
  websiteUrl: string | null;
  /** Requester's role at the organisation, e.g. "President, Coding Club". */
  requesterRole?: string | null;
  /** When the requester declared authority to represent the organisation. */
  authorityConfirmedAt?: string | null;
  status: RequestStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  user: RequestUser;
}

/** `GET /spaces/requests?status=` — returns a plain array (admin only). */
export async function getSpaceRequests(
  status?: RequestStatus
): Promise<{ data: SpaceRequest[] | null; error: ApiError | null }> {
  const query = status ? `?status=${status}` : "";
  return apiCall<SpaceRequest[]>(backendClient.get(`/spaces/requests${query}`));
}

/** `PATCH /spaces/requests/:id/approve`. */
export async function approveSpaceRequest(
  id: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(backendClient.patch(`/spaces/requests/${id}/approve`));
}

/** `PATCH /spaces/requests/:id/reject`. */
export async function rejectSpaceRequest(
  id: string,
  reviewNote?: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/spaces/requests/${id}/reject`, { reviewNote })
  );
}

/** `PATCH /spaces/event-requests/:id/approve`: personal space + draft event (D7). */
export async function approveEventRequest(
  id: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(backendClient.patch(`/spaces/event-requests/${id}/approve`));
}

/** `PATCH /spaces/event-requests/:id/reject`. */
export async function rejectEventRequest(
  id: string,
  reviewNote?: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/spaces/event-requests/${id}/reject`, { reviewNote })
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-space requests                                                          */
/* -------------------------------------------------------------------------- */

export type SubSpaceRequestType =
  | "JOIN_SUPER"
  | "CONVERT_AND_JOIN"
  | "CONVERT_TO_SUPER"
  | "CONVERT_TO_REGULAR"
  | "REMOVE_CHILD"
  | "REMOVE_PARENT";

export interface SubSpaceRequest {
  id: string;
  requestType: SubSpaceRequestType;
  subSpaceId: string | null;
  subSpace: RequestSpace | null;
  targetSpaceId: string;
  targetSpace: RequestSpace;
  requestedBy: string;
  user: RequestUser;
  reason: string;
  status: RequestStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** `GET /spaces/sub-space-requests?status=` — paginated `{ items, total, ... }`. */
export async function getSubSpaceRequests(
  status?: RequestStatus,
  page = 1,
  limit = 50
): Promise<{ data: Paginated<SubSpaceRequest> | null; error: ApiError | null }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return apiCall<Paginated<SubSpaceRequest>>(
    backendClient.get(`/spaces/sub-space-requests?${params.toString()}`)
  );
}

/** `PATCH /spaces/sub-space-requests/:id/review`. */
export async function reviewSubSpaceRequest(
  id: string,
  status: "APPROVED" | "REJECTED",
  reviewNote?: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/spaces/sub-space-requests/${id}/review`, {
      status,
      reviewNote,
    })
  );
}

export interface CreateSubSpaceRequestInput {
  requestType: SubSpaceRequestType;
  /**
   * The space being attached/detached. Required for JOIN_SUPER,
   * CONVERT_AND_JOIN, REMOVE_CHILD and REMOVE_PARENT.
   */
  subSpaceId?: string;
  /** The space the request acts on (parent / self-conversion target). */
  targetSpaceId: string;
  reason: string;
}

/** `POST /spaces/sub-space-requests` — organiser submits a parent/child request. */
export async function createSubSpaceRequest(
  input: CreateSubSpaceRequestInput
): Promise<{ data: SubSpaceRequest | null; error: ApiError | null }> {
  return apiCall<SubSpaceRequest>(
    backendClient.post(`/spaces/sub-space-requests`, input)
  );
}

/* -------------------------------------------------------------------------- */
/* Status requests                                                             */
/* -------------------------------------------------------------------------- */

export interface SpaceStatusRequest {
  id: string;
  spaceId: string;
  space: RequestSpace;
  requestedBy: string;
  user: RequestUser;
  currentStatus: string;
  requestedStatus: string;
  reason: string;
  status: RequestStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatusRequestsResponse {
  requests: SpaceStatusRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** `GET /spaces/status-requests?status=` — `{ requests, pagination }`. */
export async function getStatusRequests(
  status?: RequestStatus,
  page = 1,
  limit = 50
): Promise<{ data: StatusRequestsResponse | null; error: ApiError | null }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return apiCall<StatusRequestsResponse>(
    backendClient.get(`/spaces/status-requests?${params.toString()}`)
  );
}

/** `PATCH /spaces/status-requests/:id/review`. */
export async function reviewStatusRequest(
  id: string,
  status: "APPROVED" | "REJECTED",
  reviewNote?: string
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(`/spaces/status-requests/${id}/review`, {
      status,
      reviewNote,
    })
  );
}
