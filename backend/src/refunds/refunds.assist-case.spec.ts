import { RefundStatus } from '@prisma/client';
import { RefundsService } from './refunds.service';
import { SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE } from '../support/subject-cases';

/**
 * D6: every refund request is an Assist case. The space reviews it on its
 * desk, forwarding moves the case to Unifesto, a decision resolves it, and a
 * paid cancel is one flow that records why.
 */

process.env.RAZORPAY_KEY_ID ??= 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET ??= 'secret';

function setup(opts: { status?: RefundStatus; ownCase?: boolean } = {}) {
  const registration = {
    id: 'reg-1',
    userId: 'holder',
    eventId: 'ev-1',
    totalAmount: 105,
    processingFee: 5,
    refundedAmount: 0,
    paymentStatus: 'PAID',
    event: { id: 'ev-1', spaceId: 'sp-1', title: 'Fest', createdBy: 'curator', status: 'PUBLISHED' },
  };
  const prisma: any = {
    eventRegistration: {
      findUnique: jest.fn(async () => registration),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    groupSeatPurchase: { findMany: jest.fn(async () => []) },
    supportTicket: { findFirst: jest.fn(async () => (opts.ownCase ? { id: 'case-1' } : null)) },
    event: { findUnique: jest.fn(async () => ({ spaceId: 'sp-1' })) },
    user: { findUnique: jest.fn(async () => ({ deletedAt: null })) },
    refundRequest: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'rr-1', ...data })),
      findUnique: jest.fn(async () => ({
        id: 'rr-1',
        status: opts.status ?? RefundStatus.PENDING_CURATOR,
        eventId: 'ev-1',
        registrationId: 'reg-1',
        supportTicketId: null,
        registration: { userId: 'holder', eventId: 'ev-1', event: { title: 'Fest' } },
        event: { title: 'Fest' },
      })),
      update: jest.fn(async ({ data }: any) => ({ id: 'rr-1', ...data })),
    },
  };
  const events = { emit: jest.fn() };
  const authz = { can: jest.fn(async () => true) };
  const service = new RefundsService(prisma, {} as any, events as any, authz as any, {} as any, {} as any);
  const s = service as any;
  s.userContact = jest.fn(async () => ({ email: null, name: 'there' }));
  s.notifyEmail = jest.fn();
  s.notifyAdmin = jest.fn();
  const emitted = (name: string) => events.emit.mock.calls.filter(([n]) => n === name).map(([, e]) => e);
  return { service, prisma, emitted };
}

describe('refunds in Assist (D6)', () => {
  it("an attendee's refund opens a REFUND case on the space desk", async () => {
    const { service, emitted } = setup();
    await service.createRequest('holder', { registrationId: 'reg-1', reason: 'Clashes with exams' });
    expect(emitted(SUBJECT_CASE_OPEN)).toEqual([
      expect.objectContaining({
        subjectType: 'RefundRequest',
        subjectId: 'rr-1',
        requesterId: 'holder',
        kind: 'REFUND',
        desk: 'SPACE',
        spaceId: 'sp-1',
        eventId: 'ev-1',
        registrationId: 'reg-1',
        message: 'Clashes with exams',
        raisedForRequester: false,
      }),
    ]);
  });

  it('a refund raised from the holder’s own case stays in it; someone else’s case is not linked', async () => {
    const own = setup({ ownCase: true });
    await own.service.createRequest('holder', { registrationId: 'reg-1', reason: 'x', supportTicketId: 'case-1' });
    expect(own.prisma.refundRequest.create.mock.calls[0][0].data.supportTicketId).toBe('case-1');
    expect(own.emitted(SUBJECT_CASE_OPEN)).toEqual([]);

    const other = setup({ ownCase: false });
    await other.service.createRequest('holder', { registrationId: 'reg-1', reason: 'x', supportTicketId: 'case-9' });
    expect(other.prisma.supportTicket.findFirst.mock.calls[0][0].where).toEqual({ id: 'case-9', requesterId: 'holder' });
    expect(other.prisma.refundRequest.create.mock.calls[0][0].data.supportTicketId).toBeNull();
    expect(other.emitted(SUBJECT_CASE_OPEN)).toHaveLength(1);
  });

  it("an organiser's paid cancel records the reason and opens a CANCELLATION case with Unifesto", async () => {
    const { service, prisma, emitted } = setup();
    await service.requestCancellation('curator', 'reg-1', 'Duplicate booking');
    expect(prisma.refundRequest.create.mock.calls[0][0].data).toMatchObject({
      status: RefundStatus.PENDING_ADMIN,
      requestedAmount: null,
      reason: 'Duplicate booking',
    });
    expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: { cancellationReason: 'Duplicate booking' },
    });
    expect(emitted(SUBJECT_CASE_OPEN)[0]).toMatchObject({
      kind: 'CANCELLATION',
      desk: 'PLATFORM',
      requesterId: 'holder',
      raisedForRequester: true,
    });
  });

  it('forwarding moves the case to the Platform desk', async () => {
    const { service, emitted } = setup();
    await service.curatorReview('curator', 'rr-1', { action: 'FORWARD', note: 'Valid' });
    expect(emitted(SUBJECT_CASE_UPDATE)).toEqual([
      expect.objectContaining({ subjectId: 'rr-1', actorId: 'curator', desk: 'PLATFORM', text: expect.stringContaining('Note: Valid') }),
    ]);
  });

  it('a decline resolves the case and keeps the booking', async () => {
    const { service, prisma, emitted } = setup();
    await service.curatorReview('curator', 'rr-1', { action: 'REJECT', note: 'Past the deadline' });
    expect(emitted(SUBJECT_CASE_UPDATE)[0]).toMatchObject({ status: 'RESOLVED', text: expect.stringContaining('declined') });
    expect(prisma.eventRegistration.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'reg-1', status: { not: 'CANCELLED' } },
      data: { cancellationReason: null },
    });

    const admin = setup({ status: RefundStatus.PENDING_ADMIN });
    await admin.service.adminDecide('admin', 'rr-1', { action: 'REJECT', note: 'Policy' });
    expect(admin.emitted(SUBJECT_CASE_UPDATE)[0]).toMatchObject({ actorId: 'admin', status: 'RESOLVED' });
  });
});
