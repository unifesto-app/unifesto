import { PaymentStatus, StayBookingStatus } from '@prisma/client';
import { StayBookingsService } from './stay-bookings.service';
import { SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE } from '../support/subject-cases';
import { rateCardTerms } from '../subscription/terms.testing';

/**
 * D23: a paid stay's cancellation runs through Assist (D6 flow). The guest's
 * request opens a CANCELLATION case on the space desk instead of erroring;
 * the team's cancel posts what happened to the money and resolves it.
 */
describe('stay cancellations in Assist (D23)', () => {
  const paid = {
    id: 'b-1',
    userId: 'guest',
    eventId: 'ev-1',
    paymentMode: 'ONLINE',
    paymentStatus: PaymentStatus.PAID,
    paymentId: 'pay_1',
    totalAmount: 1020,
    processingFee: 20,
    status: StayBookingStatus.CONFIRMED,
    stay: { name: 'Hostel' },
    event: { spaceId: 'sp-1' },
  };
  const build = (existingCase: { id: string } | null = null) => {
    const prisma: any = {
      supportTicket: { findFirst: jest.fn(async () => existingCase) },
      stayBooking: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => ({})),
      },
    };
    const events = { emit: jest.fn() };
    const payments = { refund: jest.fn(async () => undefined) };
    const authz = { can: jest.fn(async () => true) };
    const svc = new StayBookingsService(prisma, {} as any, payments as any, {} as any, authz as any, {} as any, rateCardTerms(), events as any);
    const s = svc as any;
    jest.spyOn(s, 'loadMine').mockResolvedValue(paid);
    jest.spyOn(s, 'loadForEvent').mockResolvedValue(paid);
    jest.spyOn(s, 'getMine').mockResolvedValue({ id: 'b-1' });
    jest.spyOn(s, 'getForEvent').mockResolvedValue({ id: 'b-1' });
    jest.spyOn(s, 'notify').mockImplementation(() => undefined);
    const emitted = (name: string) => events.emit.mock.calls.filter(([n]) => n === name).map(([, e]) => e);
    return { svc, prisma, payments, emitted };
  };

  it('a guest asking to cancel a paid stay opens a case on the space desk and keeps the booking', async () => {
    const { svc, prisma, emitted } = build();
    await expect(svc.cancelMine('guest', 'b-1', 'Plans changed')).resolves.toMatchObject({ cancellationRequested: true });
    expect(prisma.stayBooking.updateMany).not.toHaveBeenCalled();
    expect(emitted(SUBJECT_CASE_OPEN)).toEqual([
      expect.objectContaining({
        subjectType: 'StayBooking', subjectId: 'b-1', requesterId: 'guest', kind: 'CANCELLATION',
        desk: 'SPACE', spaceId: 'sp-1', eventId: 'ev-1', message: expect.stringContaining('Plans changed'),
      }),
    ]);
  });

  it('asking again reopens the existing case', async () => {
    const { svc, emitted } = build({ id: 'case-1' });
    await svc.cancelMine('guest', 'b-1');
    expect(emitted(SUBJECT_CASE_OPEN)).toEqual([]);
    expect(emitted(SUBJECT_CASE_UPDATE)[0]).toMatchObject({ subjectId: 'b-1', status: 'OPEN' });
  });

  it('the team cancel refunds the stay price and resolves the case', async () => {
    const { svc, payments, emitted } = build();
    await svc.cancel('ev-1', 'b-1', 'curator', { refund: true, reason: 'Hostel closed' } as any);
    expect(payments.refund).toHaveBeenCalledWith('pay_1', 1000, 'stay-cancel:b-1', expect.any(Object));
    expect(emitted(SUBJECT_CASE_OPEN)[0]).toMatchObject({ subjectId: 'b-1', raisedForRequester: true });
    expect(emitted(SUBJECT_CASE_UPDATE)[0]).toMatchObject({
      subjectId: 'b-1',
      actorId: 'curator',
      status: 'RESOLVED',
      text: expect.stringMatching(/Hostel closed.*is being refunded/),
    });
  });
});
