/**
 * Check-in API Client for Mobile App.
 * Backed by the `/checkin` endpoints. Used by organisers and members who
 * have been granted check-in access to scan attendee QR codes at events.
 */

import { makeAuthenticatedRequest } from './helpers';
import { isOnline } from '../offline/connectivity';

/**
 * The request never reached the server (no signal, captive Wi-Fi). Scanners
 * catch this to fall back to the offline guest list instead of showing an error.
 */
export class CheckinNetworkError extends Error {
  constructor() {
    super("Can't reach Unifesto right now.");
    this.name = 'CheckinNetworkError';
  }
}

/** Null response + the request just failed at the network → offline, not a verdict. */
function assertReached(response: Response | null): asserts response is Response {
  if (!response && !isOnline()) throw new CheckinNetworkError();
}

export interface CheckinPoint {
  id: string;
  name: string;
}

export interface CheckinEvent {
  id: string;
  title: string;
  slug: string;
  startDateTime: string;
  endDateTime: string;
  coverImageUrl: string | null;
  venueName: string | null;
  city: string | null;
  space: { id: string; name: string } | null;
  /** The check-in points this user may work at this event. */
  checkinTypes: CheckinPoint[];
  _count: { registrations: number };
}

export interface CheckinAttendee {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface ScanResult {
  success?: boolean;
  alreadyCheckedIn?: boolean;
  checkedInAt?: string;
  attendee: CheckinAttendee;
  ticketType: string;
  checkinType?: string;
}

export interface AttendeeSearchResult {
  registrationId: string;
  /** Group member (0-based) this row is; null for an individual ticket. */
  memberIndex?: number | null;
  attendee: Omit<CheckinAttendee, 'id'> & { id: string | null };
  ticketType: string;
  checkedInAtPoint: string | null;
  /** Set on group member rows: whose group they're in. */
  groupLeadName?: string | null;
  /** False for a group seat nobody has claimed yet. */
  claimable?: boolean;
}

/** One member of a scanned group, with their status at the current point. */
export interface GroupMemberRow {
  index: number;
  name: string | null;
  email: string | null;
  checkedInAtPoint: string | null;
}

/**
 * A group registration's roster, returned by a scan instead of an immediate
 * check-in. The scanner shows these in a modal so the operator picks who's
 * actually present.
 */
export interface GroupScanResult {
  isGroup: true;
  registrationId: string;
  eventTitle: string;
  ticketType: string;
  groupSize: number;
  leadName: string | null;
  members: GroupMemberRow[];
}

export type ScanResponse = ScanResult | GroupScanResult;

export function isGroupScan(r: ScanResponse): r is GroupScanResult {
  return (r as GroupScanResult).isGroup === true;
}

export interface CheckinStats {
  total: number;
  checkedIn: number;
  remaining: number;
  cancelled: number;
  checkInRate: number | string;
}

/** Events the current user can check attendees into. GET /checkin/my-events */
export async function getMyCheckinEvents(): Promise<{ events: CheckinEvent[] }> {
  const response = await makeAuthenticatedRequest('/checkin/my-events');
  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Failed to load check-in events');
  }
  return response.json();
}

/**
 * Scan a QR code. For an individual ticket this checks the attendee in and
 * returns a ScanResult. For a group ticket it returns the roster
 * (GroupScanResult) WITHOUT checking anyone in — the caller then shows a modal
 * and submits the selected members via submitGroupCheckin. POST /checkin/scan
 */
export async function scanQRCode(
  qrCode: string,
  checkinTypeId: string
): Promise<ScanResponse> {
  const response = await makeAuthenticatedRequest('/checkin/scan', {
    method: 'POST',
    // groupAware: this client understands the group-roster response.
    body: JSON.stringify({ qrCode, checkinTypeId, groupAware: true }),
  });
  assertReached(response);
  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Check-in failed');
  }
  return response.json();
}

export interface GroupCheckinResult {
  success: boolean;
  registrationId: string;
  checkinType: string;
  checkedInCount: number;
  total: number;
  members: GroupMemberRow[];
}

/** Check in selected members of a group registration. POST /checkin/group */
export async function submitGroupCheckin(
  registrationId: string,
  checkinTypeId: string,
  memberIndexes: number[]
): Promise<GroupCheckinResult> {
  const response = await makeAuthenticatedRequest('/checkin/group', {
    method: 'POST',
    body: JSON.stringify({ registrationId, checkinTypeId, memberIndexes }),
  });
  assertReached(response);
  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Group check-in failed');
  }
  return response.json();
}

/** Manually check a registration in at a point. POST /checkin/manual */
export async function manualCheckin(
  registrationId: string,
  checkinTypeId: string,
  /** Group member to check in (null/undefined for an individual ticket). */
  memberIndex?: number | null
): Promise<ScanResult> {
  const response = await makeAuthenticatedRequest('/checkin/manual', {
    method: 'POST',
    body: JSON.stringify({
      registrationId,
      checkinTypeId,
      ...(memberIndex != null ? { memberIndex } : {}),
    }),
  });
  assertReached(response);
  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Check-in failed');
  }
  return response.json();
}

/** Search attendees for manual check-in. GET /checkin/event/:id/search */
export async function searchAttendees(
  eventId: string,
  q: string,
  checkinTypeId?: string
): Promise<{ results: AttendeeSearchResult[] }> {
  // members=1: each group member comes back as their own row.
  const params = new URLSearchParams({ q, members: '1' });
  if (checkinTypeId) params.append('checkinTypeId', checkinTypeId);
  const response = await makeAuthenticatedRequest(
    `/checkin/event/${eventId}/search?${params.toString()}`
  );
  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Search failed');
  }
  return response.json();
}

/** Live check-in stats for an event, optionally for a point. */
export async function getCheckinStats(
  eventId: string,
  checkinTypeId?: string
): Promise<CheckinStats> {
  const suffix = checkinTypeId ? `?checkinTypeId=${checkinTypeId}` : '';
  const response = await makeAuthenticatedRequest(
    `/checkin/event/${eventId}/stats${suffix}`
  );
  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Failed to load stats');
  }
  return response.json();
}

export interface RegistrationCheckinRecord {
  id: string;
  checkedInAt: string;
  /** Check-in point name (e.g. "Main Entrance", "Day 2"), or null if unknown. */
  checkinType: string | null;
  /** Name of the staff who recorded it, or null. */
  checkedBy: string | null;
}

/**
 * The check-in records for the caller's own registration — one per check-in
 * point. GET /registrations/:id/checkins. Returns [] on any failure so the
 * ticket screen degrades gracefully.
 */
export async function getRegistrationCheckins(
  registrationId: string
): Promise<RegistrationCheckinRecord[]> {
  try {
    const response = await makeAuthenticatedRequest(
      `/registrations/${registrationId}/checkins`
    );
    if (!response?.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export interface RecentCheckin {
  id: string;
  attendeeName: string;
  checkedInAt: string;
  /** Name of the organiser/staff who performed the check-in (not their id). */
  checkedBy: string;
  /** The check-in point (e.g. "Main Entrance", "Day 2") this record is for. */
  checkinType?: string;
  ticketType?: string;
}

/**
 * The most recent check-ins for an event, newest first: individuals and each
 * group member by name. GET /checkin/event/:id/recent (fresh from the DB).
 */
export async function getRecentCheckins(
  eventId: string,
  limit = 5,
  checkinTypeId?: string
): Promise<RecentCheckin[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (checkinTypeId) params.append('checkinTypeId', checkinTypeId);
  const response = await makeAuthenticatedRequest(`/checkin/event/${eventId}/recent?${params}`);
  if (!response?.ok) {
    const error = await response?.json().catch(() => null);
    throw new Error(error?.message || 'Failed to load recent check-ins');
  }
  const rows: any[] = await response.json();
  return rows.map((r) => ({
    id: r.id,
    attendeeName: r.name || 'Attendee',
    checkedInAt: r.checkedInAt,
    checkedBy: r.checkedBy || '',
    checkinType: r.checkinType?.name,
    ticketType: r.groupLeadName && r.memberIndex !== 0
      ? [r.ticketType, `${r.groupLeadName}'s group`].filter(Boolean).join(' · ')
      : r.ticketType ?? undefined,
  }));
}

// ── Offline scanning ────────────────────────────────────────────────────────

/** Check-in times keyed by check-in point id (ISO strings). */
export type PointCheckins = Record<string, string>;

export interface OfflineRosterMember {
  index: number;
  name: string | null;
  /** Only CLAIMED seats (or legacy roster rows) can be checked in. */
  claimable: boolean;
  checkins: PointCheckins;
}

export interface OfflineRosterEntry {
  registrationId: string;
  /** Registration QR plus every ticket QR that resolves to it. */
  codes: string[];
  name: string | null;
  ticketType: string;
  /** Why a live scan would refuse this registration, or null when it's fine. */
  blockedReason: string | null;
  checkins: PointCheckins;
  group: { members: OfflineRosterMember[] } | null;
}

export interface OfflineRoster {
  eventId: string;
  eventTitle: string;
  generatedAt: string;
  /** Pass to getRosterChanges to fetch only what changed. Absent on older servers. */
  cursor?: string;
  entries: OfflineRosterEntry[];
}

/** Compact guest list for scanning with no network. GET /checkin/event/:id/roster */
export async function getOfflineRoster(eventId: string): Promise<OfflineRoster> {
  const response = await makeAuthenticatedRequest(`/checkin/event/${eventId}/roster`);
  assertReached(response);
  if (!response?.ok) {
    const error = await response?.json().catch(() => null);
    throw new Error(error?.message || 'Failed to download the guest list');
  }
  return response.json();
}

export interface OfflineCheckinItem {
  id: string;
  registrationId: string;
  checkinTypeId: string;
  memberIndexes?: number[];
  scannedAt: string;
}

/** Someone had already checked this ticket in at the point before this scan. */
export interface CheckinDuplicate {
  checkedInAt: string;
  checkedInByName: string | null;
  /** The earlier check-in was made from this same account (another phone). */
  byYou: boolean;
  /** For a group: which of the submitted members were already in. */
  memberIndexes?: number[];
}

export interface OfflineSyncResult {
  id: string;
  status: 'ok' | 'already' | 'rejected';
  message?: string;
  name?: string | null;
  duplicateOf?: CheckinDuplicate;
}

/** Replay queued offline check-ins (max 200). POST /checkin/event/:id/sync */
export async function syncOfflineCheckins(
  eventId: string,
  items: OfflineCheckinItem[],
): Promise<OfflineSyncResult[]> {
  const response = await makeAuthenticatedRequest(`/checkin/event/${eventId}/sync`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  assertReached(response);
  if (!response?.ok) {
    const error = await response?.json().catch(() => null);
    throw new Error(error?.message || 'Sync failed');
  }
  const data = await response.json();
  return data.results ?? [];
}

export interface RosterChanges {
  cursor: string;
  /** Too much changed: re-download the whole list instead. */
  full: boolean;
  /** Changed registrations, in roster shape — replace by registrationId. */
  entries: OfflineRosterEntry[];
  /** Registrations that no longer belong on the list. */
  removed: string[];
}

/** What changed since a roster cursor. GET /checkin/event/:id/roster/changes */
export async function getRosterChanges(eventId: string, since: string): Promise<RosterChanges> {
  const response = await makeAuthenticatedRequest(
    `/checkin/event/${eventId}/roster/changes?since=${encodeURIComponent(since)}`,
  );
  assertReached(response);
  if (!response?.ok) {
    const error = await response?.json().catch(() => null);
    throw new Error(error?.message || 'Failed to refresh the guest list');
  }
  return response.json();
}
