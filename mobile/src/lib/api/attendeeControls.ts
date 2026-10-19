import { call } from './manageEvent';

/*
 * Attendee controls (4.0.5). Curators switch team changes and detail edits on
 * or off per event (event:edit) and can always edit details or replace members
 * (event:manage-attendees). Attendees edit their own details, and team leads
 * replace members, only while the event allows it; the server enforces both.
 */

type Answers = Record<string, unknown>;
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ── Curator switches ─────────────────────────────────────────────────────────

export interface AttendeeControls {
  allowTeamChanges: boolean;
  /** Team changes close at this time; null = open until the event ends. */
  teamChangesUntil: string | null;
  teamChangesOpen: boolean;
  attendeeEditsEnabled: boolean;
  attendeeEditsUntil: string | null;
  /** Whether attendees can edit right now (switch on, before deadline, event not over). */
  attendeeEditsOpen: boolean;
}

export const setAttendeeControls = (
  eventId: string,
  body: Partial<Pick<AttendeeControls, 'allowTeamChanges' | 'teamChangesUntil' | 'attendeeEditsEnabled' | 'attendeeEditsUntil'>>,
) => call<AttendeeControls>(`/events/${eventId}/attendee-controls`, json('PATCH', body));

// ── Attendee: my details ─────────────────────────────────────────────────────

export interface MyDetails {
  registrationId: string;
  eventId: string;
  ticketTypeId: string | null;
  isGroup: boolean;
  /** solo: their answers · lead: the team's + their own · member: their own. */
  role: 'solo' | 'lead' | 'member';
  editable: boolean;
  /** Why editing is closed, when it is. */
  lockedReason: string | null;
  editsUntil: string | null;
  /** Registration-level answers (null for a member). */
  formResponses: Answers | null;
  member: { seatIndex: number; name: string | null; customFields: Answers } | null;
}

export interface DetailsUpdate {
  formResponses?: Answers;
  name?: string;
  customFields?: Answers;
}

export const getMyDetails = (registrationId: string) => call<MyDetails>(`/registrations/${registrationId}/details`);

export const updateMyDetails = (registrationId: string, body: DetailsUpdate) =>
  call<MyDetails>(`/registrations/${registrationId}/details`, json('PATCH', body));

// ── Curator: any attendee's details ──────────────────────────────────────────

export interface CuratorDetails {
  registrationId: string;
  eventId: string;
  ticketTypeId: string | null;
  isGroup: boolean;
  formResponses: Answers;
  seats: {
    seatIndex: number;
    status: 'OPEN' | 'INVITED' | 'CLAIMED' | 'RELEASED' | string;
    name: string | null;
    email: string | null;
    customFields: Answers;
  }[];
}

export const getAttendeeDetails = (eventId: string, registrationId: string) =>
  call<CuratorDetails>(`/events/${eventId}/registrations/${registrationId}/details`);

export const updateAttendeeDetails = (eventId: string, registrationId: string, body: DetailsUpdate & { seatIndex?: number }) =>
  call<CuratorDetails>(`/events/${eventId}/registrations/${registrationId}/details`, json('PATCH', body));

// ── Replace a team member ────────────────────────────────────────────────────

export interface ReplaceResult {
  seatIndex: number;
  status: 'OPEN' | 'INVITED';
  inviteEmail: string | null;
}

/** Lead: free a filled seat and (optionally) invite someone new into it. */
export const replaceMemberAsLead = (registrationId: string, seatIndex: number, email?: string) =>
  call<ReplaceResult>(`/registrations/${registrationId}/seats/${seatIndex}/replace`, json('POST', email ? { email } : {}));

/** Curator: same, always allowed (except a member who has checked in). */
export const replaceMemberAsCurator = (eventId: string, registrationId: string, seatIndex: number, email?: string) =>
  call<ReplaceResult>(
    `/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/replace`,
    json('POST', email ? { email } : {}),
  );

// ── Team changes: remove / add members, hand over the lead ──────────────────

export interface LeadTransferInfo {
  id: string;
  /** The request is addressed to me (I'm the member being asked to lead). */
  toMe: boolean;
  fromName: string;
  toName: string;
  createdAt: string;
}

/** What I can change about my group right now. Members get `leadTransfer` only. */
export type TeamState =
  | { isLead: false; leadTransfer: LeadTransferInfo | null }
  | {
      isLead: true;
      leadTransfer: LeadTransferInfo | null;
      open: boolean;
      lockedReason: string | null;
      until: string | null;
      groupSize: number;
      minGroupSize: number;
      maxGroupSize: number | null;
      /** How many more seats can be added (null = no limit). */
      canAddUpTo: number | null;
      addPricePerSeat: number;
      addNeedsPayment: boolean;
      eventType?: string;
    };

export const getTeamState = (registrationId: string) => call<TeamState>(`/registrations/${registrationId}/team`);

export const removeSeatAsLead = (registrationId: string, seatIndex: number) =>
  call<{ groupSize: number }>(`/registrations/${registrationId}/seats/${seatIndex}/remove`, { method: 'POST' });

export const addSeatsAsLead = (registrationId: string, seats: number) =>
  call<{ groupSize: number }>(`/registrations/${registrationId}/seats/add`, json('POST', { seats }));

export interface AddSeatsOrder {
  purchaseId: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number; // paise
  currency: string;
  eventTitle: string;
  breakdown: { baseAmount: number; processingFee: number; totalAmount: number };
}

export const createAddSeatsOrder = (registrationId: string, seats: number) =>
  call<AddSeatsOrder>(`/registrations/${registrationId}/seats/add/order`, json('POST', { seats }));

export const verifyAddSeats = (
  purchaseId: string,
  body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
) => call<{ outcome: 'added' | 'refund' | 'already'; seats: number }>(`/registrations/seat-purchases/${purchaseId}/verify`, json('POST', body));

export const requestLeadTransfer = (registrationId: string, seatIndex: number) =>
  call<{ id: string }>(`/registrations/${registrationId}/lead-transfer`, json('POST', { seatIndex }));

export const cancelLeadTransfer = (registrationId: string) =>
  call<{ cancelled: boolean }>(`/registrations/${registrationId}/lead-transfer/cancel`, { method: 'POST' });

export const respondLeadTransfer = (transferId: string, accept: boolean) =>
  call<{ status: string }>(`/registrations/lead-transfers/${transferId}/respond`, json('POST', { accept }));

/** Curator: take a seat out of a group (team shrinks, seat back on sale, no refund). */
export const removeSeatAsCurator = (eventId: string, registrationId: string, seatIndex: number) =>
  call<{ groupSize: number }>(`/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/remove`, { method: 'POST' });

/** Curator: add seats without payment (collect any money outside the app). */
export const addSeatsAsCurator = (eventId: string, registrationId: string, seats: number) =>
  call<{ groupSize: number }>(`/events/${eventId}/registrations/${registrationId}/seats/add`, json('POST', { seats }));

/** Curator: make the member on this seat the group's lead, directly. */
export const makeLeadAsCurator = (eventId: string, registrationId: string, seatIndex: number) =>
  call<{ status: string }>(`/events/${eventId}/registrations/${registrationId}/seats/${seatIndex}/make-lead`, { method: 'POST' });
