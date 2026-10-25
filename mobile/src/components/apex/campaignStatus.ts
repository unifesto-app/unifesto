import type { Cosmos } from '../../theme/cosmos';


/** Word + colour for a push or email campaign status (the two enums overlap). */
export function campaignStatus(status: string, c: Cosmos): { label: string; color: string } {
  switch (status) {
    case 'SENT':
      return { label: 'Sent', color: c.success };
    case 'SENDING':
      return { label: 'Sending', color: c.primary };
    case 'SCHEDULED':
      return { label: 'Scheduled', color: c.warn };
    case 'FAILED':
      return { label: 'Failed', color: c.danger };
    case 'CANCELLED':
      return { label: 'Cancelled', color: c.muted };
    case 'PENDING':
      return { label: 'Queued', color: c.muted };
    default:
      return { label: 'Draft', color: c.muted };
  }
}
