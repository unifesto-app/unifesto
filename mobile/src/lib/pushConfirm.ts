import type { PushCategory, PushTargetType } from './api/apexComms';

export interface PushDraftSummary {
  target: PushTargetType;
  category: PushCategory;
  /** Hand-picked recipients (only for `users`). */
  userCount: number;
  /** Display name of the chosen space / event / single person, when there is one. */
  targetName: string | null;
  scheduled: boolean;
}

export interface ConfirmPrompt {
  title: string;
  message: string;
  /** Label of the button that actually sends. */
  confirmLabel: string;
}

/**
 * Whether sending this push needs an "are you sure?" first, and what it says.
 * Return null to send straight away. Sending from a phone is one thumb-slip
 * away, and a push can't be recalled once it's out.
 *
 * Friction scales with blast radius: a product update to one hand-picked
 * person goes straight out; anything wider asks, and says who it reaches.
 * Scheduled pushes can still be cancelled, so they get the softer wording.
 */
export function confirmPush(d: PushDraftSummary): ConfirmPrompt | null {
  if (d.target === 'users' && d.userCount === 1 && d.category === 'productUpdates') return null;

  const verb = d.scheduled ? 'Schedule' : 'Send';
  const who =
    d.target === 'all'
      ? 'every app user'
      : d.target === 'users'
        ? d.userCount === 1
          ? d.targetName ?? '1 person'
          : `${d.userCount} people`
        : d.target === 'space'
          ? `members of ${d.targetName ?? 'the space'}`
          : `attendees of ${d.targetName ?? 'the event'}`;
  const promo = d.category === 'promotions' ? ' as a promotion (opted-in people only)' : '';
  const tail = d.scheduled ? 'You can cancel it before it goes out.' : "It can't be recalled once delivered.";

  return {
    title: d.target === 'all' && !d.scheduled ? 'Push to everyone?' : `${verb} this push?`,
    message: `Goes to ${who}${promo}. ${tail}`,
    confirmLabel: d.target === 'all' && !d.scheduled ? 'Send to everyone' : verb,
  };
}
