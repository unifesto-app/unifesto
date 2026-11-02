import { AdminSchedulerService } from './admin-scheduler.service';

/** S64 item 5: the monthly summary's top events carry their real paid revenue. */
describe('AdminSchedulerService monthly summary', () => {
  it('ranks top events by money taken, not registrations x 499', async () => {
    const prisma: any = {
      eventRegistration: {
        aggregate: jest.fn(async () => ({ _sum: { razorpayAmount: 1250 } })),
        count: jest.fn(async () => 7),
        groupBy: jest.fn(async () => [
          { eventId: 'e-2', _sum: { razorpayAmount: 1000 } },
          { eventId: 'e-1', _sum: { razorpayAmount: 250 } },
        ]),
      },
      event: { findMany: jest.fn(async () => [{ id: 'e-1', title: 'Hack' }, { id: 'e-2', title: 'Fest' }]) },
    };
    const email: any = { sendMonthlyInvoiceSummary: jest.fn(async () => undefined) };
    const svc = new AdminSchedulerService(prisma, email, {} as any, {} as any, {} as any);

    await (svc as any).runMonthlyInvoiceSummary();

    expect(prisma.eventRegistration.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['eventId'], orderBy: { _sum: { razorpayAmount: 'desc' } }, take: 5 }),
    );
    expect(email.sendMonthlyInvoiceSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        totalRevenue: 1250,
        totalTransactions: 7,
        topEvents: [
          { title: 'Fest', revenue: 1000 },
          { title: 'Hack', revenue: 250 },
        ],
      }),
    );
  });
});
