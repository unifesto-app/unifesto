/**
 * Helpers for resolving a group seat's WhatsApp recipient. A seat's occupant is
 * either a claimed account (their `mobileNumber` / name) or a lead-typed roster
 * entry (`memberDetails.mobile` / `.name`). Kept pure + tiny so the auto-push,
 * the curator blast and the claim-time push all read a seat the same way.
 */

export interface SeatLike {
  claimedBy?: {
    mobileNumber: string | null;
    fullName: string | null;
    username: string | null;
  } | null;
  memberDetails?: unknown;
}

function memberDetail(seat: SeatLike, key: string): string | null {
  const details = (seat.memberDetails ?? {}) as Record<string, unknown>;
  const value = details[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** The seat occupant's phone: claimed account first, then the typed roster. */
export function seatPhone(seat: SeatLike): string | null {
  return seat.claimedBy?.mobileNumber || memberDetail(seat, 'mobile') || null;
}

/** A friendly name for the WhatsApp greeting; falls back to "there". */
export function seatMemberName(seat: SeatLike): string {
  return (
    seat.claimedBy?.fullName ||
    seat.claimedBy?.username ||
    memberDetail(seat, 'name') ||
    'there'
  );
}
