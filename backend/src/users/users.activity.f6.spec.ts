import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';

/** F6: Apex user detail lists every registration and every payment, newest first. */
describe('UsersService.getUserActivityAdmin (F6)', () => {
  const d = (n: number) => new Prisma.Decimal(n);
  const money = (amount: number, paidAt: string) => ({
    totalAmount: d(amount),
    refundedAmount: d(0),
    paymentStatus: 'PAID',
    paymentId: `pay_${paidAt}`,
    paidAt: new Date(paidAt),
  });
  const event = { id: 'ev-1', title: 'Fest' };
  const prisma: any = {
    eventRegistration: {
      findMany: jest.fn(async () => [
        { id: 'r-paid', registeredAt: new Date('2026-10-01'), event, ...money(500, '2026-10-01') },
        { id: 'r-free', registeredAt: new Date('2026-10-05'), event, ...money(0, '2026-10-05') },
      ]),
    },
    groupSeatPurchase: {
      findMany: jest.fn(async () => [{ id: 'g-1', seats: 2, createdAt: new Date(), registration: { event }, ...money(300, '2026-10-03') }]),
    },
    sessionRegistration: {
      findMany: jest.fn(async () => [{ id: 's-1', registeredAt: new Date(), session: { title: 'Huddle' }, ...money(99, '2026-10-04') }]),
    },
    stayBooking: { findMany: jest.fn(async () => []) },
  };

  it('keeps free registrations in the list but only paid rows in payments, newest first', async () => {
    const svc = new UsersService(prisma as never, {} as never, {} as never);
    const { registrations, payments } = await svc.getUserActivityAdmin('u-1');
    expect(registrations).toHaveLength(2);
    expect(payments.map((p) => [p.kind, p.id, p.amount])).toEqual([
      ['SESSION', 's-1', 99],
      ['SEATS', 'g-1', 300],
      ['TICKET', 'r-paid', 500],
    ]);
  });
});
