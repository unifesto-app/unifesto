import { errorFrom, makeAuthenticatedRequest } from './helpers';

export interface AttendeeData {
  name: string;
  email: string;
  mobile: string;
  gender: string;
  customFields?: Record<string, any>;
}

export interface CreateRegistrationData {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  attendees?: AttendeeData[];
  formResponses?: Record<string, any>;
  /** Optional discount code applied to the base ticket amount at checkout. */
  couponCode?: string;
}

export const createPaymentOrder = async (eventId: string, data: {
  ticketTypeId: string;
  quantity: number;
  groupSize?: number;
  groupMembers?: Array<Record<string, any>>;
  formResponses?: Record<string, any>;
  /** Optional discount code, applied to the base ticket amount at checkout. */
  couponCode?: string;
  /** Campaign attribution from the tagged link that brought the user here. */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}) => {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/register/create-order`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response?.ok) throw await errorFrom(response, 'Failed to create order');
  return response.json();
};

/** What a coupon would take off a ticket selection. Does not hold a slot. */
export interface CouponQuote {
  code: string;
  discount: number;
  baseAmount: number;
}

/**
 * Validate a discount code against a ticket selection before paying. Throws with
 * a buyer-readable message when the code does not apply. The slot is only held
 * when the payment order is actually created.
 */
export const validateCoupon = async (
  eventId: string,
  data: { code: string; ticketTypeId: string; quantity?: number; groupSize?: number },
): Promise<CouponQuote> => {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/coupons/validate`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response?.ok) throw await errorFrom(response, 'That discount code is not valid');
  return response.json();
};

export const createRegistration = createPaymentOrder; // Alias for backward compatibility

export const getRazorpayConfig = async () => {
  const response = await makeAuthenticatedRequest('/payments/razorpay/config');
  if (!response?.ok) {
    throw new Error('Failed to fetch Razorpay config');
  }
  return response.json();
};

export const verifyPayment = async (eventId: string, data: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  registrationId: string;
}) => {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/register/verify`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response?.ok) throw await errorFrom(response, 'Payment verification failed');
  return response.json();
};

// --- Waiting list ----------------------------------------------------------

export type WaitlistStatus =
  | 'WAITING'
  | 'OFFERED'
  | 'CONVERTED'
  | 'EXPIRED'
  | 'DECLINED';

/**
 * Returned by `createPaymentOrder` when the ticket had sold
 * out and the user was queued instead. There is no order to pay yet, so
 * callers must check `isWaitlisted` before opening the Razorpay sheet.
 */
export interface WaitlistJoinResult {
  registrationId: string;
  isWaitlisted: true;
  waitlistStatus: WaitlistStatus;
  position: number;
  message: string;
}

export const isWaitlistJoin = (r: any): r is WaitlistJoinResult =>
  Boolean(r) && r.isWaitlisted === true;

export interface MyWaitlistEntry {
  registrationId: string;
  event: {
    id: string;
    title: string;
    slug: string;
    type?: string;
    coverImageUrl: string | null;
    startDateTime: string;
    venueName: string | null;
    city: string | null;
  };
  ticketType: {
    id: string;
    name: string;
    price: number;
    currency: string;
  } | null;
  waitlistStatus: WaitlistStatus;
  joinedAt: string | null;
  /** Place in the queue. null once an offer has been made. */
  position: number | null;
  /** Set only while OFFERED — what to pay and by when. */
  offer: {
    offeredAt: string | null;
    expiresAt: string | null;
    amountDue: number;
    totalAmount: number;
    processingFee: number;
    needsPayment: boolean;
  } | null;
}

/** My queue entries, with position and any spot I've been offered. */
export const getMyWaitlist = async (): Promise<MyWaitlistEntry[]> => {
  const response = await makeAuthenticatedRequest('/users/me/waitlist');
  if (!response?.ok) return [];
  return response.json();
};

/**
 * Creates the Razorpay order to claim an offered spot. Verify the result
 * through the normal `verifyPayment` route — the backend recognises a waiting
 * list conversion and skips claiming the seat twice.
 */
export const createWaitlistOfferOrder = async (registrationId: string) => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/waitlist/pay`,
    { method: 'POST' },
  );

  if (!response?.ok) throw await errorFrom(response, 'Could not start payment for this spot');
  return response.json();
};

/** Leave the queue, or turn down a spot that was offered. */
export const leaveWaitlist = async (registrationId: string) => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/waitlist`,
    { method: 'DELETE' },
  );

  if (!response?.ok) throw await errorFrom(response, 'Could not leave the waiting list');
  return response.json();
};

export const cancelRegistration = async (eventId: string) => {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/register`, {
    method: 'DELETE',
  });

  if (!response?.ok) throw await errorFrom(response, 'Cancellation failed');
  return response.json();
};

/** Cancel my own free registration by id. Paid tickets are rejected by the
 *  backend — those go through the refund flow instead. */
export const cancelMyRegistration = async (registrationId: string, reason?: string) => {
  const response = await makeAuthenticatedRequest(`/registrations/${registrationId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });

  if (!response?.ok) throw await errorFrom(response, 'Could not cancel your ticket');
  return response.json();
};

/**
 * Deletes a finished ticket (event over, or ticket cancelled) from my own
 * list. The registration itself stays for the organiser and the group.
 */
export const deleteMyTicket = async (registrationId: string) => {
  const response = await makeAuthenticatedRequest(`/users/me/registrations/${registrationId}`, {
    method: 'DELETE',
  });

  if (!response?.ok) throw await errorFrom(response, 'Could not delete this ticket');
  return response.json();
};

export const getMyRegistrations = async (page = 1, limit = 20) => {
  const response = await makeAuthenticatedRequest(`/users/me/registrations?page=${page}&limit=${limit}`);
  if (!response?.ok) return null;
  return response.json();
};

/** Tickets where I'm a group member of someone else's registration (not lead).
 *  GET /users/me/member-tickets. Returns [] on any failure. */
export const getMyMemberTickets = async () => {
  const response = await makeAuthenticatedRequest('/users/me/member-tickets');
  if (!response?.ok) return { data: [] };
  return response.json();
};

export interface GroupMemberInput {
  name: string;
  email: string;
  mobile: string;
  gender: string;
  /** Answers to the event's per-member custom fields, keyed by field id. */
  customFields?: Record<string, any>;
}

export interface MyGroupRoster {
  groupSize: number;
  editable: boolean;
  members: GroupMemberInput[];
  /** Used to fetch the event's custom-field definitions for the edit form. */
  eventId: string;
  ticketTypeId: string | null;
}

/** My group registration roster (lead only). GET /registrations/:id/group-members */
export const getMyGroupMembers = async (
  registrationId: string
): Promise<MyGroupRoster | null> => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/group-members`
  );
  if (!response?.ok) return null;
  return response.json();
};

/** Set / complete my group roster. PATCH /registrations/:id/group-members */
/**
 * Save roster edits by seat position (index 0 = seat 1, the lead). `null`
 * leaves that seat as it is, so open / invited seats never need fake details.
 */
export const updateMyGroupMembers = async (
  registrationId: string,
  groupMembers: (GroupMemberInput | null)[]
) => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/group-members`,
    { method: 'PATCH', body: JSON.stringify({ groupMembers }) }
  );
  if (!response?.ok) throw await errorFrom(response, 'Failed to save group members');
  return response.json();
};

/** The WhatsApp group invite for my ticket, plus whether I've marked as joined. */
export interface TicketWhatsappGroup {
  registrationId: string;
  /** Resolved link: event group, else event community, else parent community. */
  inviteUrl: string | null;
  isCommunity: boolean;
  joined: boolean;
}

/**
 * WhatsApp group invite + my join state for ONE specific registration (this
 * ticket), resolved by its ticket type. Keyed by registrationId so a user who
 * holds multiple ticket types for one event gets the exact ticket viewed.
 * GET /registrations/:id/whatsapp-group
 */
export const getRegistrationWhatsappGroup = async (
  registrationId: string
): Promise<TicketWhatsappGroup | null> => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/whatsapp-group`
  );
  if (!response?.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data) return null;
  return {
    registrationId: data.registrationId,
    inviteUrl: data.inviteUrl ?? null,
    isCommunity: !!data.isCommunity,
    joined: !!data.joined,
  };
};

/**
 * Mark (or clear) that I've joined this event's WhatsApp group. Setting it
 * suppresses any future organiser invite blast for my registration.
 * PATCH /registrations/:id/whatsapp-joined
 */
export const setWhatsappGroupJoined = async (
  registrationId: string,
  joined: boolean
) => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/whatsapp-joined`,
    { method: 'PATCH', body: JSON.stringify({ joined }) }
  );
  if (!response?.ok) throw await errorFrom(response, 'Failed to update join status');
  return response.json();
};

// ============================================================================
// Organiser / Gate APIs
// ============================================================================

export interface EventRegistration {
  id: string;
  eventId: string;
  userId: string;
  status: string;
  qrCode?: string | null;
  ticketType?: { id: string; name: string } | null;
  checkedInAt?: string | null;
  checkedInBy?: string | null;
  user?: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
    email?: string | null;
  } | null;
  attendees?: Array<{ name: string; email?: string }>;
  createdAt: string;
}

/**
 * Get registrations for an event (organiser / gate access).
 * GET /events/:id/registrations
 */
export const getEventRegistrations = async (
  eventId: string,
  page = 1,
  limit = 50,
  options?: { checkedIn?: boolean; search?: string }
) => {
  const query = new URLSearchParams();
  query.append('page', String(page));
  query.append('limit', String(limit));
  if (options?.checkedIn !== undefined) query.append('checkedIn', String(options.checkedIn));
  if (options?.search) query.append('search', options.search);

  const response = await makeAuthenticatedRequest(
    `/events/${eventId}/registrations?${query.toString()}`
  );
  if (!response?.ok) throw await errorFrom(response, 'Failed to fetch registrations');
  return response.json();
};

/**
 * Check in an attendee by scanned QR code.
 * POST /events/:id/checkin  { qrCode }
 */
export const checkIn = async (eventId: string, qrCode: string) => {
  const response = await makeAuthenticatedRequest(`/events/${eventId}/checkin`, {
    method: 'POST',
    body: JSON.stringify({ qrCode }),
  });
  if (!response?.ok) throw await errorFrom(response, 'Check-in failed');
  return response.json();
};

// ── Group seats (fast-registration Part 2) ───────────────────────────────────

export type GroupSeatStatus = 'OPEN' | 'INVITED' | 'CLAIMED' | 'RELEASED';

export interface GroupSeat {
  seatIndex: number;
  status: GroupSeatStatus;
  inviteEmail: string | null;
  memberDetails: Record<string, any> | null;
  claimedByUserId: string | null;
  claimedAt: string | null;
}

/** Lead: list the seats of a group registration. */
export const getRegistrationSeats = async (registrationId: string): Promise<{ seats: GroupSeat[] }> => {
  const response = await makeAuthenticatedRequest(`/registrations/${registrationId}/seats`);
  if (!response?.ok) throw await errorFrom(response, 'Could not load seats');
  return response.json();
};

/** Lead: invite people (by email) to OPEN seats. */
export const inviteSeats = async (
  registrationId: string,
  invites: { seatIndex?: number; email: string }[],
) => {
  const response = await makeAuthenticatedRequest(`/registrations/${registrationId}/seats/invite`, {
    method: 'POST',
    body: JSON.stringify({ invites }),
  });
  if (!response?.ok) throw await errorFrom(response, 'Could not send invites');
  return response.json();
};

/** Lead: revoke an INVITED seat back to OPEN (rotates its token). */
export const revokeSeat = async (registrationId: string, seatIndex: number) => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/seats/${seatIndex}/revoke`,
    { method: 'POST' },
  );
  if (!response?.ok) throw await errorFrom(response, 'Could not revoke the seat');
  return response.json();
};

/** Lead: retire an unfilled seat (OPEN/INVITED → RELEASED); keeps capacity. */
export const releaseSeat = async (registrationId: string, seatIndex: number) => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/seats/${seatIndex}/release`,
    { method: 'POST' },
  );
  if (!response?.ok) throw await errorFrom(response, 'Could not release the seat');
  return response.json();
};

/** Lead: bring a retired seat back into play (RELEASED → OPEN). */
export const reopenSeat = async (registrationId: string, seatIndex: number) => {
  const response = await makeAuthenticatedRequest(
    `/registrations/${registrationId}/seats/${seatIndex}/reopen`,
    { method: 'POST' },
  );
  if (!response?.ok) throw await errorFrom(response, 'Could not reopen the seat');
  return response.json();
};

/** Member: claim-screen info for a token (event + seat). */
export const getClaimInfo = async (token: string) => {
  const response = await makeAuthenticatedRequest(`/registrations/claim/${token}`);
  if (!response?.ok) throw await errorFrom(response, 'This claim link is invalid or expired');
  return response.json();
};

/** A group seat someone invited me to, still waiting to be claimed. */
export interface MyInvite {
  token: string;
  seatIndex: number;
  invitedBy: string | null;
  event: {
    id: string;
    title: string;
    slug: string;
    startDateTime: string;
    coverImageUrl: string | null;
    venueName: string | null;
    city: string | null;
  };
}

/** Pending seat invites sent to my account's emails. [] on failure / older servers. */
export const getMyInvites = async (): Promise<MyInvite[]> => {
  try {
    const response = await makeAuthenticatedRequest('/registrations/invites/mine');
    if (!response?.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.invites) ? data.invites : [];
  } catch {
    return [];
  }
};

/** Member: claim the seat (atomic on the server). */
export const claimSeat = async (token: string, memberDetails?: Record<string, any>) => {
  const response = await makeAuthenticatedRequest(`/registrations/claim/${token}`, {
    method: 'POST',
    body: JSON.stringify({ memberDetails }),
  });
  if (!response?.ok) throw await errorFrom(response, 'Could not claim the seat');
  return response.json();
};

/** Member: decline the invite (re-opens the seat). */
export const declineSeat = async (token: string) => {
  const response = await makeAuthenticatedRequest(`/registrations/claim/${token}/decline`, {
    method: 'POST',
  });
  if (!response?.ok) throw await errorFrom(response, 'Could not decline the invite');
  return response.json();
};
