import { ContentReportTarget } from '@prisma/client';

/**
 * Allowed reasons per report target. The app shows its own labels for these
 * keys; the server only accepts keys from the matching list.
 */
export const CONTENT_REPORT_REASONS: Record<ContentReportTarget, readonly string[]> = {
  EVENT: ['scam_or_fraud', 'misleading', 'inappropriate', 'spam', 'fake_or_cancelled', 'other'],
  SPACE: ['impersonation', 'scam_or_fraud', 'inappropriate', 'spam', 'other'],
  REGISTRATION: ['payment_issue', 'ticket_not_working', 'wrong_details', 'event_changed_or_cancelled', 'refund_issue', 'other'],
};
