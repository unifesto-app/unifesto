import type { Session } from '@prisma/client';

/**
 * Session policy — the two genuine *product* decisions for sessions, kept as
 * pure functions so they can change without touching payment or DB code and are
 * trivially unit-testable. Both are deliberately tunable in one place.
 *
 * These encode the two knobs surfaced during design:
 *   1. the join window   — when the meeting link becomes usable
 *   2. the cancel policy  — when an organiser may cancel (which auto-refunds)
 */

/** Minutes before start that the "Join" action goes hot. Before this, a
 * registered attendee can see they're in but can't open the link yet — which
 * stops the link leaking hours ahead. */
export const JOIN_OPENS_MINUTES_BEFORE_START = 15;

/** Minutes past the scheduled end during which joining is still allowed
 * (people wander in late; the host may run over). */
export const JOIN_GRACE_MINUTES_AFTER_END = 15;

export interface JoinWindow {
  opensAt: Date;
  closesAt: Date;
  isOpen: boolean;
}

/**
 * The window during which a registered attendee may open the meeting link.
 * Pure function of the session's start + duration, so the UI and the server
 * agree on "can I join yet?" without extra state.
 */
export function joinWindow(
  session: Pick<Session, 'startDateTime' | 'durationMinutes'>,
  now: Date = new Date(),
): JoinWindow {
  const start = session.startDateTime.getTime();
  const opensAt = start - JOIN_OPENS_MINUTES_BEFORE_START * 60_000;
  const closesAt =
    start + (session.durationMinutes + JOIN_GRACE_MINUTES_AFTER_END) * 60_000;
  const t = now.getTime();
  return {
    opensAt: new Date(opensAt),
    closesAt: new Date(closesAt),
    isOpen: t >= opensAt && t <= closesAt,
  };
}

export interface CancelDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Whether an organiser may cancel a session right now. Cancelling a PUBLISHED
 * paid session auto-refunds every payer, so the policy question is really
 * "how late is too late to pull the plug?".
 *
 * Default: cancellable while it hasn't started yet (DRAFT or PUBLISHED). Once a
 * session is under way it should be COMPLETED, not cancelled — refunding people
 * who already attended is not the intent. Tune the cutoff here if you want a
 * hard "no cancels within N minutes of start" rule.
 */
export function canCancel(
  session: Pick<Session, 'status' | 'startDateTime'>,
  now: Date = new Date(),
): CancelDecision {
  if (session.status === 'CANCELLED') {
    return { allowed: false, reason: 'Session is already cancelled' };
  }
  if (session.status === 'COMPLETED') {
    return { allowed: false, reason: 'Session has already ended' };
  }
  if (now.getTime() >= session.startDateTime.getTime()) {
    return {
      allowed: false,
      reason: 'Session has already started — mark it completed instead',
    };
  }
  return { allowed: true };
}
