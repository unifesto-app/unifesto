import { makeAuthenticatedRequest } from './helpers';

export type ReportTarget = 'EVENT' | 'SPACE' | 'REGISTRATION';

/** Reason keys the server accepts per target, with the labels the app shows. */
export const REPORT_REASONS: Record<ReportTarget, { key: string; label: string }[]> = {
  EVENT: [
    { key: 'scam_or_fraud', label: 'Scam or fraud' },
    { key: 'misleading', label: 'Misleading details' },
    { key: 'fake_or_cancelled', label: "Fake, or it isn't happening" },
    { key: 'inappropriate', label: 'Inappropriate content' },
    { key: 'spam', label: 'Spam' },
    { key: 'other', label: 'Something else' },
  ],
  SPACE: [
    { key: 'impersonation', label: 'Pretending to be someone else' },
    { key: 'scam_or_fraud', label: 'Scam or fraud' },
    { key: 'inappropriate', label: 'Inappropriate content' },
    { key: 'spam', label: 'Spam' },
    { key: 'other', label: 'Something else' },
  ],
  REGISTRATION: [
    { key: 'payment_issue', label: 'Payment problem' },
    { key: 'ticket_not_working', label: 'Ticket or QR not working' },
    { key: 'wrong_details', label: 'Wrong details on my ticket' },
    { key: 'event_changed_or_cancelled', label: 'Event changed or was cancelled' },
    { key: 'refund_issue', label: 'Refund problem' },
    { key: 'other', label: 'Something else' },
  ],
};

/** Report an event, a space, or one of my tickets. Re-reporting updates the open report. */
export async function submitContentReport(input: {
  targetType: ReportTarget;
  targetId: string;
  reason: string;
  details?: string;
}): Promise<{ id: string; alreadyReported: boolean }> {
  const response = await makeAuthenticatedRequest('/content-reports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response) throw new Error('Please sign in to send a report.');
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    if (response.status === 429) throw new Error("You've sent a few reports already. Please try again in a few minutes.");
    const msg = Array.isArray(err?.message) ? err.message[0] : err?.message;
    throw new Error(msg || "Couldn't send your report. Please try again.");
  }
  return response.json();
}
