import { RefundStatus, RegistrationStatus } from '@prisma/client';
import { RefundsService } from './refunds.service';

process.env.RAZORPAY_KEY_ID ??= 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET ??= 'secret';

/**
 * A full refund releases seats only for a row that still holds them. A row the
 * team cancelled first already gave its seats back; releasing again drifts the
 * counters down and lets the ticket oversell. A row whose automatic sold-out
 * refund is due must not be refunded a second time.
 */
function approve(reg: { status: RegistrationStatus; refundDueAt?: Date | null }) {
  const registration = {
    id: 'reg-1', userId: 'holder', eventId: 'ev-1',
    totalAmount: 105, processingFee: 5, razorpayAmount: 105, refundedAmount: 0,
    paymentId: 'pay_1', groupSize: null, quantity: 1, ticketTypeId: 'tt-1',
    refundDueAt: null, event: { title: 'Fest' }, ...reg,
  };
  const tx = {
    eventRegistration: {
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: reg.status === RegistrationStatus.CANCELLED ? 0 : 1 })),
    },
    event: { update: jest.fn(async () => ({})) },
    eventTicketType: { update: jest.fn(async () => ({})) },
    eventTicket: { updateMany: jest.fn(async () => ({})) },
    groupSeatPurchase: { update: jest.fn(async () => ({})) },
    refundRequest: { update: jest.fn(async () => ({})) },
  };
  const prisma = {
    refundRequest: {
      findUnique: jest.fn(async () => ({
        id: 'rr-1',
        status: RefundStatus.PENDING_ADMIN,
        eventId: 'ev-1',
        registrationId: 'reg-1',
        registration,
      })),
      // PENDING_ADMIN -> PROCESSING claim (S11), and its release on failure.
      update: jest.fn(async () => ({})),
    },
    eventRegistration: { findUniqueOrThrow: jest.fn(async () => registration) },
    groupSeatPurchase: { findMany: jest.fn(async () => []) },
    user: { findUnique: jest.fn(async () => ({ deletedAt: null })) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new RefundsService(
    prisma as any,
    {} as any,
    { emit: jest.fn() } as any,
    { can: async () => true } as any,
    { eventOverdrawn: async () => 0 } as any,
    {} as any,
  );
  const s = service as any;
  const refund = jest.fn(async () => ({ id: 'rfnd_1' }));
  s.razorpay = { payments: { refund, fetchMultipleRefund: jest.fn(async () => ({ items: [] })) } };
  s.userContact = jest.fn(async () => ({ email: null, name: 'there' }));
  s.notifyEmail = jest.fn();
  s.notifyOtherPayers = jest.fn(async () => undefined);
  return { run: () => service.adminDecide('admin', 'rr-1', { action: 'APPROVE' } as any), tx, refund };
}

describe('full refund seat release', () => {
  it('a live registration gives its seat back once', async () => {
    const { run, tx } = approve({ status: RegistrationStatus.REGISTERED });
    await run();
    expect(tx.eventTicketType.update).toHaveBeenCalledWith({
      where: { id: 'tt-1' },
      data: { soldCount: { decrement: 1 } },
    });
  });

  it('a registration cancelled before the refund releases nothing again', async () => {
    const { run, tx, refund } = approve({ status: RegistrationStatus.CANCELLED });
    await run();
    expect(refund).toHaveBeenCalled();
    expect(tx.eventTicketType.update).toHaveBeenCalledWith({
      where: { id: 'tt-1' },
      data: { soldCount: { decrement: 0 } },
    });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: { registeredCount: { decrement: 0 } },
    });
  });

  it('a row already being refunded automatically is not refunded twice', async () => {
    const { run, refund } = approve({ status: RegistrationStatus.CANCELLED, refundDueAt: new Date() });
    await expect(run()).rejects.toThrow(/already being refunded/);
    expect(refund).not.toHaveBeenCalled();
  });
});
