import { RefundStatus } from '@prisma/client';
import { RefundsService } from './refunds.service';
import { REDACTED_REFUND_REASON } from '../common/account-deletion';

/**
 * Account close keeps the reason on a refund still in review; deciding it
 * then redacts the reason, but only when the holder's account is closed.
 */

process.env.RAZORPAY_KEY_ID ??= 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET ??= 'secret';

function setup(holderDeletedAt: Date | null, status: RefundStatus) {
  const prisma = {
    refundRequest: {
      findUnique: jest.fn(async () => ({
        id: 'rr-1',
        status,
        eventId: 'ev-1',
        registration: { userId: 'holder', eventId: 'ev-1', event: { title: 'Fest' } },
        event: { title: 'Fest' },
      })),
      update: jest.fn(async ({ data }: any) => data),
    },
    user: { findUnique: jest.fn(async () => ({ deletedAt: holderDeletedAt })) },
  };
  const service = new RefundsService(prisma as any, {} as any, { emit: jest.fn() } as any);
  const s = service as any;
  s.assertOrganiser = jest.fn(async () => undefined);
  s.userContact = jest.fn(async () => ({ email: null, name: 'there' }));
  s.notifyEmail = jest.fn();
  return { service, update: prisma.refundRequest.update };
}

describe('refund decisions for a closed account', () => {
  it('admin reject redacts the reason when the holder’s account is closed', async () => {
    const { service, update } = setup(new Date(), RefundStatus.PENDING_ADMIN);
    await service.adminDecide('admin', 'rr-1', { action: 'REJECT', note: 'late' } as any);
    expect(update.mock.calls[0][0].data.reason).toBe(REDACTED_REFUND_REASON);
  });

  it('curator reject redacts it too', async () => {
    const { service, update } = setup(new Date(), RefundStatus.PENDING_CURATOR);
    await service.curatorReview('curator', 'rr-1', { action: 'REJECT', note: 'no' } as any);
    expect(update.mock.calls[0][0].data.reason).toBe(REDACTED_REFUND_REASON);
  });

  it('forwarding to admin keeps the reason (not decided yet)', async () => {
    const { service, update } = setup(new Date(), RefundStatus.PENDING_CURATOR);
    (service as any).notifyAdmin = jest.fn();
    await service.curatorReview('curator', 'rr-1', { action: 'FORWARD' } as any);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('reason');
  });

  it('leaves the reason alone for a live account', async () => {
    const { service, update } = setup(null, RefundStatus.PENDING_ADMIN);
    await service.adminDecide('admin', 'rr-1', { action: 'REJECT', note: 'late' } as any);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('reason');
  });
});

describe('refund approval for a closed account', () => {
  // A ₹100 + ₹5 fee ticket; approving refunds the ₹100 base in full. Only the
  // outside world (Razorpay, email, notices) is stubbed — the settlement math
  // and the transaction's writes run for real.
  function approve(holderDeletedAt: Date | null) {
    const txRequestUpdate = jest.fn(async () => ({}));
    const tx = {
      eventRegistration: { update: jest.fn(async () => ({})) },
      event: { update: jest.fn(async () => ({})) },
      eventTicketType: { update: jest.fn(async () => ({})) },
      eventTicket: { updateMany: jest.fn(async () => ({})) },
      groupSeatPurchase: { update: jest.fn(async () => ({})) },
      refundRequest: { update: txRequestUpdate },
    };
    const prisma = {
      refundRequest: {
        findUnique: jest.fn(async () => ({
          id: 'rr-1',
          status: RefundStatus.PENDING_ADMIN,
          eventId: 'ev-1',
          registration: {
            id: 'reg-1',
            userId: 'holder',
            eventId: 'ev-1',
            totalAmount: 105,
            processingFee: 5,
            razorpayAmount: 105,
            refundedAmount: 0,
            paymentId: 'pay_1',
            groupSize: null,
            quantity: 1,
            ticketTypeId: null,
            event: { title: 'Fest' },
          },
        })),
      },
      groupSeatPurchase: { findMany: jest.fn(async () => []) },
      user: { findUnique: jest.fn(async () => ({ deletedAt: holderDeletedAt })) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new RefundsService(prisma as any, {} as any, { emit: jest.fn() } as any);
    const s = service as any;
    const refund = jest.fn(async () => ({ id: 'rfnd_1' }));
    s.razorpay = { payments: { refund } };
    s.userContact = jest.fn(async () => ({ email: null, name: 'there' }));
    s.notifyEmail = jest.fn();
    s.notifyOtherPayers = jest.fn(async () => undefined);
    return { service, txRequestUpdate, refund };
  }

  it('redacts the reason in the same write that records the approval', async () => {
    const { service, txRequestUpdate, refund } = approve(new Date());
    await service.adminDecide('admin', 'rr-1', { action: 'APPROVE' } as any);

    expect(refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 10000 }));
    const { data } = (txRequestUpdate.mock.calls[0] as any)[0];
    expect(data).toMatchObject({
      status: RefundStatus.APPROVED,
      reason: REDACTED_REFUND_REASON,
      approvedAmount: 100,
      cashRefunded: 100,
      razorpayRefundId: 'rfnd_1',
    });
  });

  it('keeps the reason when the holder’s account is live', async () => {
    const { service, txRequestUpdate } = approve(null);
    await service.adminDecide('admin', 'rr-1', { action: 'APPROVE' } as any);
    const { data } = (txRequestUpdate.mock.calls[0] as any)[0];
    expect(data.status).toBe(RefundStatus.APPROVED);
    expect(data).not.toHaveProperty('reason');
  });
});
