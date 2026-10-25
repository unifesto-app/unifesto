import { SupportDesk, SupportTicketStatus } from '@prisma/client';
import { SupportService } from './support.service';

/** UNIFESTO-BACKEND-6: one stats call must not take the whole 10-connection pool. */
describe('SupportService.getStats pool use', () => {
  let inFlight = 0;
  let peak = 0;
  const query = <T>(value: T) =>
    jest.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return value;
    });

  const prisma: any = {
    supportTicket: {
      fields: { requesterLastReadAt: 'requesterLastReadAt', deskLastReadAt: 'deskLastReadAt' },
      count: query(2),
      groupBy: jest.fn(async (args: { by: string[] }) =>
        args.by[0] === 'status'
          ? query([
              { status: SupportTicketStatus.OPEN, _count: { _all: 5 } },
              { status: SupportTicketStatus.CLOSED, _count: { _all: 3 } },
            ])()
          : query([])(),
      ),
      findMany: query([{ desk: SupportDesk.PLATFORM, createdAt: new Date(), firstResponseAt: null, resolvedAt: null }]),
    },
  };
  const authz: any = { can: jest.fn(async () => true) };
  const service = new SupportService(prisma, authz, {} as any, {} as any);

  it('counts statuses from one groupBy and keeps at most 3 queries in flight', async () => {
    const stats = await service.getStats('admin-1');
    expect(stats).toMatchObject({ open: 5, pending: 0, resolved: 0, closed: 3, total: 8 });
    expect(stats).toHaveProperty('desks');
    expect(peak).toBeLessThanOrEqual(3);
  });
});
