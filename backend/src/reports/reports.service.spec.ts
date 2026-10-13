import { ReportStatus, ReportType } from '@prisma/client';
import { ReportsService } from './reports.service';

/** S33: report PDFs render off the request; interrupted renders get failed. */
describe('ReportsService background generation', () => {
  const build = (gather: jest.Mock) => {
    const prisma: any = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'e1',
          spaceId: 's1',
          title: 'Fest',
          type: 'OFFLINE',
          space: { name: 'Space' },
        }),
      },
      userRole: { count: jest.fn().mockResolvedValue(1) },
      eventReport: {
        create: jest.fn().mockResolvedValue({ id: 'r1', status: ReportStatus.PENDING }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const svc = new ReportsService(prisma, {} as any, { gather } as any, {} as any, {} as any, { can: async () => true } as any);
    jest.spyOn(svc as any, 'spaceHasAnalyticsPlan').mockResolvedValue(true);
    return { svc, prisma };
  };

  it('returns the PENDING row without waiting for the render', async () => {
    const { svc } = build(jest.fn(() => new Promise(() => undefined))); // never settles
    const res = await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
    expect(res.status).toBe(ReportStatus.PENDING);
  });

  it('a failed render marks the row FAILED instead of throwing at the caller', async () => {
    const { svc, prisma } = build(jest.fn().mockRejectedValue(new Error('boom')));
    await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
    await new Promise((r) => setImmediate(r));
    expect(prisma.eventReport.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: ReportStatus.FAILED, error: 'boom' },
    });
  });

  it('list fails PENDING rows older than the stale window', async () => {
    const { svc, prisma } = build(jest.fn());
    await svc.list('u1', 'e1');
    const arg = prisma.eventReport.updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe(ReportStatus.PENDING);
    expect(arg.data.status).toBe(ReportStatus.FAILED);
  });
});
