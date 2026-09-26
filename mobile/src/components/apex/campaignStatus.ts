import type { Tokens } from '../../theme/tokens';

/** Word + colour for a push or email campaign status (the two enums overlap). */
export function campaignStatus(status: string, tokens: Tokens): { label: string; color: string } {
  switch (status) {
    case 'SENT':
      return { label: 'Sent', color: tokens.success };
    case 'SENDING':
      return { label: 'Sending', color: tokens.accent };
    case 'SCHEDULED':
      return { label: 'Scheduled', color: tokens.warning };
    case 'FAILED':
      return { label: 'Failed', color: tokens.danger };
    case 'CANCELLED':
      return { label: 'Cancelled', color: tokens.textMuted };
    case 'PENDING':
      return { label: 'Queued', color: tokens.textMuted };
    default:
      return { label: 'Draft', color: tokens.textMuted };
  }
}
