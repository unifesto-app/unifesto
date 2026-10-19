/** How long a deletion request can be cancelled before the account closes. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** When an account whose deletion was requested at `requestedAt` closes. */
export function deletionDueAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
}

/**
 * A closed account's refund request reason becomes this — at close for a
 * decided refund, or when one still in review is decided.
 */
export const REDACTED_REFUND_REASON = 'Removed when the account was closed';

/**
 * I5: the one placeholder for an erased person's name, wherever a name column
 * can't be null (certificates, stay guests, bank-account holders, tickets).
 */
export const ERASED_NAME = 'Erased user';

/** What a closed account's own support messages read as afterwards. */
export const REDACTED_SUPPORT_MESSAGE = 'Removed when the account was closed';
