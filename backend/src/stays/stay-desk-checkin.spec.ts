import { PaymentStatus, StayBookingStatus } from '@prisma/client';
import { StayBookingsService } from './stay-bookings.service';
import { rateCardTerms } from '../subscription/terms.testing';

/**
 * G12: crew can't mark a stay paid on its own (S30), so at the property desk
 * they record pay-at-property money as part of check-in, in one write.
 */
describe('stay desk check-in with money collected (G12)', () => {
  const unpaid = {
    id: 'b-1',
    paymentMode: 'PAY_AT_PROPERTY',
    paymentStatus: PaymentStatus.PENDING,
    totalAmount: 1500,
    status: StayBookingStatus.CONFIRMED,
  };
  const build = () => {
    const prisma: any = { stayBooking: { updateMany: jest.fn(async () => ({ count: 1 })) } };
    const svc = new StayBookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, rateCardTerms(), {} as any);
    jest.spyOn(svc as any, 'loadForEvent').mockResolvedValue(unpaid);
    jest.spyOn(svc as any, 'getForEvent').mockResolvedValue({ id: 'b-1' });
    return { svc, prisma };
  };

  it('still refuses to check in an unpaid pay-at-property stay without the money', async () => {
    const { svc, prisma } = build();
    await expect(svc.checkIn('ev-1', 'b-1', 'crew')).rejects.toThrow(/Collect/);
    expect(prisma.stayBooking.updateMany).not.toHaveBeenCalled();
  });

  it('marks it paid and checks in together when the desk collected it', async () => {
    const { svc, prisma } = build();
    await svc.checkIn('ev-1', 'b-1', 'crew', true);
    expect(prisma.stayBooking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b-1', status: StayBookingStatus.CONFIRMED, paymentStatus: PaymentStatus.PENDING },
      data: expect.objectContaining({
        status: StayBookingStatus.CHECKED_IN,
        checkedInById: 'crew',
        paymentStatus: PaymentStatus.PAID,
        paidAt: expect.any(Date),
      }),
    });
  });
});
