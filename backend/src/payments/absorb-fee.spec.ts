import { ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { EventsService } from '../events/events.service';

/** A33 (D11): an organiser can absorb the 5% buyer fee into the ticket price. */
describe('absorbed buyer fee (A33)', () => {
  const payments = new PaymentsService({
    getProcessingFeePercent: () => 5,
    getProcessingFeeCapPerTicket: () => 99,
  } as any);

  it('fee on top (default): buyer pays price + 5%', () => {
    expect(payments.priceSale(500)).toEqual({ base: 500, fee: 25, total: 525 });
  });

  it('absorbed: buyer pays the listed price and the fee comes out of it', () => {
    expect(payments.priceSale(500, 1, true)).toEqual({ base: 476.19, fee: 23.81, total: 500 });
  });

  it('absorbed fee keeps the ₹99 per-ticket cap', () => {
    expect(payments.priceSale(3000, 1, true)).toEqual({ base: 2901, fee: 99, total: 3000 });
    expect(payments.priceSale(3 * 3000, 3, true)).toEqual({ base: 8703, fee: 297, total: 9000 });
  });

  it('base + fee always equals what the buyer pays, so refunds and payouts stay exact', () => {
    for (const listed of [1, 99.99, 333, 1999, 2079, 12345.67]) {
      const s = payments.priceSale(listed, 1, true);
      expect(Math.round((s.base + s.fee) * 100)).toBe(Math.round(listed * 100));
    }
  });

  it('free stays free either way', () => {
    expect(payments.priceSale(0, 1, true)).toEqual({ base: 0, fee: 0, total: 0 });
  });

  describe('who can switch it', () => {
    const build = (canMoney: boolean) => {
      const prisma: any = {
        event: {
          findUnique: jest.fn(async () => ({ id: 'ev', spaceId: 'sp', status: 'PUBLISHED', slug: 'e', absorbProcessingFee: false, space: {} })),
        },
      };
      const authz: any = { can: jest.fn(async () => canMoney) };
      const svc = new EventsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, authz);
      jest.spyOn(svc, 'canManageEvent').mockResolvedValue(true);
      return svc;
    };

    it('a Co-Curator without money rights cannot', async () => {
      await expect(build(false).updateEvent('u', 'ev', { absorbProcessingFee: true } as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('sending the same value needs no money rights', async () => {
      // Rejected later for an unrelated reason in this bare mock, never by the money gate.
      await expect(build(false).updateEvent('u', 'ev', { absorbProcessingFee: false } as any)).rejects.not.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
