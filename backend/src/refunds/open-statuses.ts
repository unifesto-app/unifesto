import { RefundStatus } from '@prisma/client';

/**
 * A refund request still owes money: one per registration (partial unique
 * index), and its amount is held out of payouts until it settles.
 */
export const OPEN_REFUND_STATUSES: RefundStatus[] = [
  RefundStatus.PENDING_CURATOR,
  RefundStatus.PENDING_ADMIN,
  RefundStatus.PROCESSING,
  RefundStatus.REFUND_FAILED,
];
