import { EventSchedulerService } from './event-scheduler.service';

describe('auto-complete leaves series parents alone (A29)', () => {
  it('only completes non-recurring events', async () => {
    const prisma = { event: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const redis = { runExclusive: jest.fn(async (_k: string, _t: number, task: () => Promise<void>) => task()) };
    const svc = new EventSchedulerService(prisma as any, {} as any, redis as any);
    await svc.markCompletedEvents();
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ isRecurring: false }),
      data: { status: 'COMPLETED' },
    });
  });
});
