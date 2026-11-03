/**
 * Helpers for resolving a group seat's WhatsApp recipient. A seat's occupant is
 * either a claimed account (their `mobileNumber` / name) or a lead-typed roster
 * entry (`memberDetails.mobile` / `.name`). Kept pure + tiny so the auto-push,
 * the curator blast and the claim-time push all read a seat the same way.
 */
import { isPlaceholderMobile } from '../auth/identifiers';

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

/**
 * The number to reach an attendee on (A35): their account's, unless that is a
 * placeholder, then the one typed for them (a curator's import / manual add,
 * or a lead's roster). Null when neither is real.
 */
export function contactMobile(
  account: string | null | undefined,
  typed: string | null | undefined,
): string | null {
  return account && !isPlaceholderMobile(account) ? account : typed || null;
}

/** The seat occupant's phone: claimed account first, then the typed roster. */
export function seatPhone(seat: SeatLike): string | null {
  return contactMobile(seat.claimedBy?.mobileNumber, memberDetail(seat, 'mobile'));
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
