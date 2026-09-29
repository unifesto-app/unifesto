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
  attendeeEditsEnabled: boolean;
  attendeeEditsUntil: string | null;
  /** Whether attendees can edit right now (switch on, before deadline, event not over). */
  attendeeEditsOpen: boolean;
}

export const setAttendeeControls = (
  eventId: string,
  body: Partial<Pick<AttendeeControls, 'allowTeamChanges' | 'attendeeEditsEnabled' | 'attendeeEditsUntil'>>,
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
