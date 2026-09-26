/**
 * Registrations API — event attendee management.
 * Backed by `/events/:id/registrations` and `/checkin` endpoints.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type RegistrationStatus = "REGISTERED" | "ATTENDED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

/**
 * One captured attendee for a GROUP registration. A group registration is a
 * single row whose `user` is the team lead; the full team (lead included) lives
 * in `groupMembers`. Keys mirror what the mobile app sends at registration.
 */
export interface GroupMember {
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  gender?: string | null;
  customFields?: Record<string, unknown> | null;
}

export type GroupSeatStatus = "OPEN" | "INVITED" | "CLAIMED";

/**
 * One seat of a pay-first GROUP registration (fast-registration Part 2). The
 * lead pays for N seats; each is OPEN, then INVITED (email sent), then CLAIMED
 * once the member confirms. Organiser-visible; the invite token is never exposed.
 */
export interface GroupSeat {
  seatIndex: number;
  status: GroupSeatStatus;
  inviteEmail?: string | null;
  memberDetails?: Record<string, unknown> | null;
  claimedAt?: string | null;
  claimedBy?: {
    fullName: string | null;
    username: string | null;
    email: string | null;
  } | null;
}

export interface Registration {
  id: string;
  eventId: string;
  userId: string;
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    email: string | null;
    avatarUrl: string | null;
    mobileNumber?: string | null;
  };
  ticketTypeId?: string;
  ticketType?: {
    id: string;
    name: string;
    price: number;
    currency: string;
  };
  quantity: number;
  /** People count for a GROUP registration; null/undefined for individual. */
  groupSize?: number | null;
  /** Captured attendee details for a GROUP registration (lead + members). */
  groupMembers?: GroupMember[] | null;
  /** Per-seat status for a pay-first GROUP registration (fast-registration Part 2). */
  groupSeats?: GroupSeat[] | null;
  totalAmount: number;
  razorpayAmount: number;
  processingFee: number;
  paymentStatus: PaymentStatus;
  paymentId?: string;
  orderId?: string;
  paidAt?: string;
  status: RegistrationStatus;
  isWaitlisted: boolean;
  qrCode: string;
  checkedInAt?: string;
  checkedInBy?: string;
  checkedInByUser?: {
    id: string;
    fullName: string | null;
    username: string | null;
  };
  checkinRecords?: Array<{
    checkedInAt: string;
    checkinTypeId: string;
    checkinType?: {
      id: string;
      name: string;
    };
    checkedInBy: string;
    checkedInByUser?: {
      id: string;
      fullName: string | null;
      username: string | null;
    };
  }>;
  formResponses?: Record<string, unknown>;
  registeredAt: string;
  cancelledAt?: string;
}

export interface RegistrationListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: RegistrationStatus;
  paymentStatus?: PaymentStatus;
  ticketTypeId?: string;
  /**
   * When true, return only registrations that count as attending (not
   * cancelled, paid/partially-refunded, not waitlisted) — so the attendees
   * list matches the "No. of attendees" headcount. Explicit `status`/
   * `paymentStatus` filters override it. Aggregate views (e.g. the transactions
   * financial summary) omit it to still receive every registration.
   */
  attendingOnly?: boolean;
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

export interface RegistrationListResponse {
  registrations: Registration[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CheckinStats {
  total: number;
  checkedIn: number;
  remaining: number;
  cancelled: number;
  checkInRate: string; // Backend returns string from toFixed(2)
}

/**
 * How many people are attending, split by how they booked.
 *
 * A group booking is one registration but many attendees, so a single
 * "registrations" number is misleading on any event with group tickets. These
 * are the counts of *people*, with the group bookings called out separately.
 */
export interface AttendeeStats {
  /** Total people. Equals individual.attendees + group.attendees. */
  attendees: number;
  individual: {
    attendees: number;
    /** Number of bookings — same as attendees for individual tickets. */
    bookings: number;
  };
  group: {
    /** People inside group bookings. */
    attendees: number;
    /** How many group bookings that is. */
    groups: number;
  };
  byTicketType: {
    ticketTypeId: string | null;
    name: string;
    kind: string;
    attendees: number;
    bookings: number;
  }[];
}

/**
 * Attendee headcount for an event, split into individual and group bookings.
 * Backed by `GET /events/:id/attendee-stats`.
 */
export async function getAttendeeStats(
  eventId: string
): Promise<{ data: AttendeeStats | null; error: ApiError | null }> {
  return apiCall<AttendeeStats>(
    backendClient.get(`/events/${eventId}/attendee-stats`)
  );
}

/**
 * Get registrations for an event (organizers only).
 * Backed by `GET /events/:id/registrations`.
 */
export async function getEventRegistrations(
  eventId: string,
  params?: RegistrationListParams
): Promise<{ data: RegistrationListResponse | null; error: ApiError | null }> {
  const { data, error } = await apiCall<{
    registrations: Registration[];
    total: number;
    page: number;
    limit: number;
  }>(backendClient.get(`/events/${eventId}/registrations`, { params }));

  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };

  const totalPages = Math.ceil((data.total || 0) / (data.limit || 50));

  return {
    data: {
      registrations: data.registrations || [],
      pagination: {
        page: data.page || 1,
        limit: data.limit || 50,
        total: data.total || 0,
        totalPages,
      },
    },
    error: null,
  };
}

/**
 * Fetch every registration for an event by walking the paginated list endpoint.
 * Used by views that need event-wide aggregates — e.g. the transactions page's
 * financial summary — where a single page can't produce accurate totals.
 * Page 1 is fetched first to learn the page count, then the remainder in parallel.
 */
export async function getAllEventRegistrations(
  eventId: string,
  params?: Omit<RegistrationListParams, "page" | "limit">
): Promise<{ data: Registration[] | null; error: ApiError | null }> {
  const PAGE_SIZE = 100;
  const first = await getEventRegistrations(eventId, {
    ...params,
    page: 1,
    limit: PAGE_SIZE,
  });
  if (first.error) return { data: null, error: first.error };
  if (!first.data) return { data: [], error: null };

  const { registrations, pagination } = first.data;
  if (pagination.totalPages <= 1) return { data: registrations, error: null };

  const rest = await Promise.all(
    Array.from({ length: pagination.totalPages - 1 }, (_, i) =>
      getEventRegistrations(eventId, { ...params, page: i + 2, limit: PAGE_SIZE })
    )
  );

  const all = [...registrations];
  for (const result of rest) {
    if (result.error) return { data: null, error: result.error };
    if (result.data) all.push(...result.data.registrations);
  }
  return { data: all, error: null };
}

/** File extension for each export format (Excel uses SpreadsheetML `.xls`). */
export const EXPORT_EXTENSION: Record<ExportFormat, string> = {
  csv: "csv",
  xlsx: "xls",
  pdf: "pdf",
};

/**
 * Export registrations as CSV, Excel or PDF.
 * Backed by `GET /events/:id/registrations/export?format=&type=`.
 *
 * `type` selects the column set:
 *  - "attendees" (default): full attendee data + custom form responses
 *  - "transactions": payment/transaction columns only (paid rows)
 */
export async function exportRegistrations(
  eventId: string,
  format: ExportFormat = "csv",
  type: "attendees" | "transactions" = "attendees"
): Promise<{ data: Blob | null; error: ApiError | null }> {
  try {
    const response = await backendClient.get(
      `/events/${eventId}/registrations/export`,
      { params: { format, type }, responseType: "blob" }
    );
    return { data: response.data, error: null };
  } catch (error: unknown) {
    // A blob error response hides the JSON message; read it back out.
    let message = "Export failed";
    const responseData = (error as { response?: { data?: unknown } })?.response
      ?.data;
    if (responseData instanceof Blob) {
      try {
        const parsed = JSON.parse(await responseData.text());
        if (parsed?.message) message = parsed.message;
      } catch {
        /* keep default message */
      }
    } else if (error instanceof Error) {
      message = error.message;
    }
    return { data: null, error: { status: 500, message, errors: null } };
  }
}

/**
 * Get a single registration's full detail (organiser only).
 * Backed by `GET /events/:id/registrations/:registrationId`.
 */
export async function getRegistrationById(
  eventId: string,
  registrationId: string
): Promise<{ data: Registration | null; error: ApiError | null }> {
  return apiCall<Registration>(
    backendClient.get(`/events/${eventId}/registrations/${registrationId}`)
  );
}

/**
 * ADMIN: transfer a registration directly to the account that owns `email`.
 * Reassigns the holder — same ticket, QR, payment and roster — provided that
 * account exists and isn't already registered for this event. Organisers can't
 * call this; they use `requestTransfer`.
 * Backed by `POST /events/:id/registrations/:registrationId/transfer`.
 */
export async function transferRegistration(
  eventId: string,
  registrationId: string,
  email: string
): Promise<{ data: Registration | null; error: ApiError | null }> {
  return apiCall<Registration>(
    backendClient.post(
      `/events/${eventId}/registrations/${registrationId}/transfer`,
      { email }
    )
  );
}

/** A ticket-transfer request (organiser → admin). */
export interface TransferRequest {
  id: string;
  targetEmail: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  registration: {
    id: string;
    groupSize: number | null;
    event: { id: string; title: string; slug: string; spaceId: string };
    ticketType: { id: string; name: string } | null;
    user: {
      id: string;
      fullName: string | null;
      username: string | null;
      identities?: { email: string | null }[];
    };
  };
  requester: { id: string; fullName: string | null; username: string | null };
}

export interface TransferRequestsResponse {
  requests: TransferRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * SPACE_ADMIN: request an admin to transfer a registration.
 * Backed by `POST /events/:id/registrations/:registrationId/transfer-request`.
 */
export async function requestTransfer(
  eventId: string,
  registrationId: string,
  email: string,
  reason?: string
): Promise<{ data: TransferRequest | null; error: ApiError | null }> {
  return apiCall<TransferRequest>(
    backendClient.post(
      `/events/${eventId}/registrations/${registrationId}/transfer-request`,
      { email, reason }
    )
  );
}

/** SPACE_ADMIN: my transfer requests. `GET /registration-transfer-requests/my`. */
export async function getMyTransferRequests(): Promise<{
  data: TransferRequest[] | null;
  error: ApiError | null;
}> {
  return apiCall<TransferRequest[]>(
    backendClient.get("/registration-transfer-requests/my")
  );
}

/** ADMIN: transfer-request inbox. `GET /registration-transfer-requests`. */
export async function getTransferRequests(
  status?: "PENDING" | "APPROVED" | "REJECTED",
  page = 1,
  limit = 50
): Promise<{ data: TransferRequestsResponse | null; error: ApiError | null }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return apiCall<TransferRequestsResponse>(
    backendClient.get(`/registration-transfer-requests?${params.toString()}`)
  );
}

/**
 * ADMIN: approve (performs the transfer) or reject a request, optionally
 * overriding the target email. `PATCH /registration-transfer-requests/:id/review`.
 */
export async function reviewTransferRequest(
  requestId: string,
  status: "APPROVED" | "REJECTED",
  opts?: { reviewNote?: string; email?: string }
): Promise<{ data: unknown | null; error: ApiError | null }> {
  return apiCall(
    backendClient.patch(
      `/registration-transfer-requests/${requestId}/review`,
      { status, reviewNote: opts?.reviewNote, email: opts?.email }
    )
  );
}

/**
 * Get check-in stats for an event.
 * Backed by `GET /checkin/event/:id/stats`.
 */
export async function getCheckinStats(
  eventId: string,
  checkinTypeId?: string
): Promise<{ data: CheckinStats | null; error: ApiError | null }> {
  return apiCall<CheckinStats>(
    backendClient.get(`/checkin/event/${eventId}/stats`, {
      params: checkinTypeId ? { checkinTypeId } : undefined,
    })
  );
}

interface ScanResult {
  success?: boolean;
  alreadyCheckedIn?: boolean;
  checkedInAt?: string;
  attendee: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  ticketType: string;
  checkinType?: string;
  message?: string;
}

/** Scan a QR code to check an attendee in at a point. `POST /checkin/scan`. */
export async function scanQRCode(
  qrCode: string,
  checkinTypeId: string
): Promise<{ data: ScanResult | null; error: ApiError | null }> {
  return apiCall(backendClient.post("/checkin/scan", { qrCode, checkinTypeId }));
}

// --- Check-in points (types) -----------------------------------------------

export interface CheckinType {
  id: string;
  name: string;
  order?: number;
}

/** List an event's check-in points. `GET /checkin/event/:id/types`. */
export async function getCheckinTypes(
  eventId: string
): Promise<{ data: { types: CheckinType[] } | null; error: ApiError | null }> {
  return apiCall(backendClient.get(`/checkin/event/${eventId}/types`));
}

/** Add a check-in point. `POST /checkin/event/:id/types`. */
export async function createCheckinType(
  eventId: string,
  name: string
): Promise<{ data: CheckinType | null; error: ApiError | null }> {
  return apiCall(backendClient.post(`/checkin/event/${eventId}/types`, { name }));
}

/** Delete a check-in point. `DELETE /checkin/event/:id/types/:typeId`. */
export async function deleteCheckinType(
  eventId: string,
  typeId: string
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.delete(`/checkin/event/${eventId}/types/${typeId}`)
  );
}

/**
 * Get all registrations for offline caching (organizers only).
 * Backed by `GET /checkin/event/:id`.
 */
export async function getOfflineRegistrations(
  eventId: string
): Promise<{ data: Registration[] | null; error: ApiError | null }> {
  const { data, error } = await apiCall<{ registrations: Registration[] }>(
    backendClient.get(`/checkin/event/${eventId}`)
  );
  if (error) return { data: null, error };
  return { data: data?.registrations || [], error: null };
}

/**
 * Bulk check-in by registration IDs.
 * Backed by `POST /checkin/event/:id/bulk`.
 */
export async function bulkCheckin(
  eventId: string,
  registrationIds: string[]
): Promise<{
  data: {
    success: number;
    failed: number;
    results: Array<{ id: string; success: boolean; message?: string }>;
  } | null;
  error: ApiError | null;
}> {
  return apiCall(
    backendClient.post(`/checkin/event/${eventId}/bulk`, { registrationIds })
  );
}

// --- Per-point check-in access (event team members) ------------------------

export interface CheckinAccessMember {
  userId: string;
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  role: { code: string; name: string } | null;
  /** True when granted every point. */
  allPoints: boolean;
  /** Specific point ids granted (empty when allPoints). */
  grantedTypeIds: string[];
}

export interface CheckinAccessResponse {
  eventId: string;
  types: CheckinType[];
  members: CheckinAccessMember[];
}

/** Team members + their per-point check-in grants. `GET /checkin/event/:id/access`. */
export async function getCheckinAccess(
  eventId: string
): Promise<{ data: CheckinAccessResponse | null; error: ApiError | null }> {
  return apiCall(backendClient.get(`/checkin/event/${eventId}/access`));
}

/**
 * Replace a team member's check-in grants. `checkinTypeIds` = "ALL" for every
 * point, [] to revoke, or specific point ids. `PUT /checkin/event/:id/access/:userId`.
 */
export async function setCheckinAccess(
  eventId: string,
  userId: string,
  checkinTypeIds: string[] | "ALL"
): Promise<{ data: { success: boolean } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.put(`/checkin/event/${eventId}/access/${userId}`, {
      checkinTypeIds,
    })
  );
}

// --- Manual check-in --------------------------------------------------------

export interface AttendeeSearchResult {
  registrationId: string;
  attendee: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  ticketType: string;
  checkedInAtPoint: string | null;
}

/** Search attendees for manual check-in. `GET /checkin/event/:id/search`. */
export async function searchAttendees(
  eventId: string,
  q: string,
  checkinTypeId?: string
): Promise<{ data: { results: AttendeeSearchResult[] } | null; error: ApiError | null }> {
  return apiCall(
    backendClient.get(`/checkin/event/${eventId}/search`, {
      params: { q, ...(checkinTypeId ? { checkinTypeId } : {}) },
    })
  );
}

/** Manually check a registration in at a point. `POST /checkin/manual`. */
export async function manualCheckin(
  registrationId: string,
  checkinTypeId: string
): Promise<{ data: ScanResult | null; error: ApiError | null }> {
  return apiCall(
    backendClient.post(`/checkin/manual`, { registrationId, checkinTypeId })
  );
}
