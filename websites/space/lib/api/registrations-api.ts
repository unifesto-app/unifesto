/**
 * Registrations API — event attendee management.
 * Backed by `/events/:id/registrations` and `/checkin` endpoints.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type RegistrationStatus = "REGISTERED" | "ATTENDED" | "CANCELLED";
export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

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

export type GroupSeatStatus = "OPEN" | "INVITED" | "CLAIMED" | "RELEASED";

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
  /** When this member seat was sent the WhatsApp group invite (null = never). */
  whatsappInviteSentAt?: string | null;
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
  /** Why the registration was cancelled, when known. Null on a live row. */
  cancellationReason?: string | null;
  /** When the WhatsApp group invite was sent to this attendee (null = never). */
  whatsappInviteSentAt?: string | null;
  /** When the attendee self-marked as joined the WhatsApp group (null = not). */
  whatsappGroupJoinedAt?: string | null;
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

/** One utm source/medium/campaign bucket of confirmed registrations. */
export interface RegistrationSource {
  /** null = untagged ("Direct"). */
  source: string | null;
  medium: string | null;
  campaign: string | null;
  registrations: number;
  revenue: number;
}

export interface RegistrationSources {
  total: number;
  tagged: number;
  sources: RegistrationSource[];
}

/**
 * Confirmed registrations grouped by the utm tags of the link that brought
 * each attendee in. Backed by `GET /events/:id/registration-sources`.
 */
export async function getRegistrationSources(
  eventId: string
): Promise<{ data: RegistrationSources | null; error: ApiError | null }> {
  return apiCall<RegistrationSources>(
    backendClient.get(`/events/${eventId}/registration-sources`)
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

// --- Manual & bulk attendee management -------------------------------------

/** One row's outcome in a bulk import. */
export interface ImportRowResult {
  line: number;
  name: string;
  email: string;
  status: "created" | "skipped" | "errored";
  reason?: string;
}

/** The result of a bulk CSV import. */
export interface ImportReport {
  ticketTypeName: string;
  total: number;
  created: number;
  skipped: number;
  errored: number;
  rows: ImportRowResult[];
}

/** One row's predicted outcome in a dry-run import preview. */
export interface ImportPreviewRow {
  line: number;
  name: string;
  email: string;
  outcome: "create" | "skip" | "error";
  /** For `create` rows: true when a brand-new account will be minted. */
  newAccount?: boolean;
  reason?: string;
}

/** The dry-run result of validating a CSV before importing. Creates nothing. */
export interface ImportPreview {
  ticketTypeName: string;
  total: number;
  willCreate: number;
  willSkip: number;
  willError: number;
  newAccounts: number;
  /** Seats left for this ticket type before importing (null = unlimited). */
  remainingCapacity: number | null;
  rows: ImportPreviewRow[];
}

/** One member of a manually-added group registration (name required). */
export interface ManualGroupMember {
  name: string;
  email?: string;
  mobile?: string;
  gender?: string;
  /** This member's own custom-field answers, keyed by field id. */
  customFields?: Record<string, unknown>;
}

export interface ManualAddPayload {
  ticketTypeId: string;
  name: string;
  email: string;
  mobile: string;
  gender: string;
  groupSize?: number;
  groupMembers?: ManualGroupMember[];
  /** Individual: the attendee's answers. Group: the team-wide (per-group) answers. */
  formResponses?: Record<string, unknown>;
  /** Group only: the lead member's own per-member answers, keyed by field id. */
  leadCustomFields?: Record<string, unknown>;
  /** Paid tickets only: send a Razorpay payment link instead of comping. */
  collectPayment?: boolean;
  /** Comp only: email the ticket immediately (default true). */
  sendTicketEmail?: boolean;
}

export interface ManualAddResult {
  registrationId: string;
  paymentStatus: "PAID" | "PENDING";
  /** Present when a payment link was sent. */
  paymentLinkUrl?: string;
  amount?: number;
  message: string;
}

/**
 * Download the CSV import template for a ticket type. Columns are derived from
 * the ticket's kind (group tickets get member columns) and custom form fields.
 * Backed by `GET /events/:id/registrations/import-template?ticketTypeId=`.
 */
export async function downloadImportTemplate(
  eventId: string,
  ticketTypeId: string
): Promise<{ data: Blob | null; error: ApiError | null }> {
  try {
    const response = await backendClient.get(
      `/events/${eventId}/registrations/import-template`,
      { params: { ticketTypeId }, responseType: "blob" }
    );
    return { data: response.data, error: null };
  } catch (error: unknown) {
    let message = "Could not download the template";
    const responseData = (error as { response?: { data?: unknown } })?.response
      ?.data;
    if (responseData instanceof Blob) {
      try {
        const parsed = JSON.parse(await responseData.text());
        if (parsed?.message) message = parsed.message;
      } catch {
        /* keep default */
      }
    } else if (error instanceof Error) {
      message = error.message;
    }
    return { data: null, error: { status: 500, message, errors: null } };
  }
}

/**
 * Bulk-import attendees for a ticket type from a CSV file. Every imported
 * attendee is comped (no payment). Backed by `POST /events/:id/registrations/import`.
 */
export async function importAttendees(
  eventId: string,
  ticketTypeId: string,
  file: File,
  sendTicketEmails: boolean
): Promise<{ data: ImportReport | null; error: ApiError | null }> {
  const form = new FormData();
  form.append("file", file);
  form.append("ticketTypeId", ticketTypeId);
  form.append("sendTicketEmails", String(sendTicketEmails));
  return apiCall<ImportReport>(
    backendClient.post(`/events/${eventId}/registrations/import`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

/**
 * Dry-run a CSV import: validate the file and preview the per-row outcome without
 * creating anything. Backed by `POST /events/:id/registrations/import/preview`.
 */
export async function previewImportAttendees(
  eventId: string,
  ticketTypeId: string,
  file: File
): Promise<{ data: ImportPreview | null; error: ApiError | null }> {
  const form = new FormData();
  form.append("file", file);
  form.append("ticketTypeId", ticketTypeId);
  return apiCall<ImportPreview>(
    backendClient.post(
      `/events/${eventId}/registrations/import/preview`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
  );
}

/**
 * Manually add one attendee. Comps them unless `collectPayment` is set on a paid
 * ticket. Backed by `POST /events/:id/registrations/manual`.
 */
export async function manualAddAttendee(
  eventId: string,
  payload: ManualAddPayload
): Promise<{ data: ManualAddResult | null; error: ApiError | null }> {
  return apiCall<ManualAddResult>(
    backendClient.post(`/events/${eventId}/registrations/manual`, payload)
  );
}

/** Per-outcome tally returned by the WhatsApp group-invite blast. */
export interface WhatsappInviteResult {
  eligible: number;
  sent: number;
  noPhone: number;
  /** Eligible attendees whose ticket type / event had no resolvable group link. */
  noLink: number;
  failed: number;
}

/**
 * Send the event's WhatsApp group/community invite to every confirmed attendee
 * who hasn't already been invited or self-marked as joined (send-once).
 * Backed by `POST /events/:id/whatsapp-group-invite` (event:manage-attendees).
 */
export async function sendWhatsappGroupInvite(
  eventId: string
): Promise<{ data: WhatsappInviteResult | null; error: ApiError | null }> {
  return apiCall<WhatsappInviteResult>(
    backendClient.post(`/events/${eventId}/whatsapp-group-invite`)
  );
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
 * Restore a cancelled registration back to REGISTERED (organiser).
 * Re-consumes the seat and re-activates the tickets; leaves payment/refund state
 * untouched. Backed by `POST /events/:id/registrations/:registrationId/restore`.
 */
export async function restoreRegistration(
  eventId: string,
  registrationId: string
): Promise<{ data: Registration | null; error: ApiError | null }> {
  return apiCall<Registration>(
    backendClient.post(
      `/events/${eventId}/registrations/${registrationId}/restore`
    )
  );
}

/** Result of releasing / reopening a single group seat. */
export interface SeatMutationResult {
  seatIndex: number;
  status: GroupSeatStatus;
}

/**
 * Retire an unfilled group seat (OPEN/INVITED → RELEASED). Capacity stays held;
 * nothing is resold or refunded. The seat drops off the manage screen.
 * Backed by `POST /events/:id/registrations/:registrationId/seats/:seatIndex/release`.
 */
export async function releaseGroupSeat(
  eventId: string,
  registrationId: string,
  seatIndex: number
): Promise<{ data: SeatMutationResult | null; error: ApiError | null }> {
  return apiCall<SeatMutationResult>(
    backendClient.post(
      `/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/release`
    )
  );
}

/**
 * Bring a retired seat back into play (RELEASED → OPEN) with a fresh token.
 * Backed by `POST /events/:id/registrations/:registrationId/seats/:seatIndex/reopen`.
 */
export async function reopenGroupSeat(
  eventId: string,
  registrationId: string,
  seatIndex: number
): Promise<{ data: SeatMutationResult | null; error: ApiError | null }> {
  return apiCall<SeatMutationResult>(
    backendClient.post(
      `/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/reopen`
    )
  );
}

/**
 * Take a seat out of a group: the group gets one smaller, the seat goes back
 * on sale, nothing is refunded. Later seats are renumbered.
 * Backed by `POST /events/:id/registrations/:registrationId/seats/:seatIndex/remove`.
 */
export async function removeGroupSeat(
  eventId: string,
  registrationId: string,
  seatIndex: number
): Promise<{ data: { groupSize: number } | null; error: ApiError | null }> {
  return apiCall<{ groupSize: number }>(
    backendClient.post(
      `/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/remove`
    )
  );
}

/**
 * Add seats to a group without payment (collect any money outside the app).
 * Backed by `POST /events/:id/registrations/:registrationId/seats/add`.
 */
export async function addGroupSeats(
  eventId: string,
  registrationId: string,
  seats: number
): Promise<{ data: { groupSize: number } | null; error: ApiError | null }> {
  return apiCall<{ groupSize: number }>(
    backendClient.post(
      `/events/${eventId}/registrations/${registrationId}/seats/add`,
      { seats }
    )
  );
}

/**
 * Make the member on this seat the group's lead (they take over the booking;
 * the old lead becomes a member).
 * Backed by `POST /events/:id/registrations/:registrationId/seats/:seatIndex/make-lead`.
 */
export async function makeGroupLead(
  eventId: string,
  registrationId: string,
  seatIndex: number
): Promise<{ data: { status: string } | null; error: ApiError | null }> {
  return apiCall<{ status: string }>(
    backendClient.post(
      `/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/make-lead`
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
    success: Array<{ id: string; name: string | null }>;
    alreadyCheckedIn: Array<{ id: string; name: string | null }>;
    failed: Array<{ id: string; reason: string }>;
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
