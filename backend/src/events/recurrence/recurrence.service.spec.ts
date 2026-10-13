import { Prisma } from '@prisma/client';
import { RecurrenceService } from './recurrence.service';

const DAY = 86_400_000;

function setup(opts: { createFails?: (n: number) => unknown } = {}) {
  const start = new Date(Date.now() + DAY);
  const parent = {
    id: 'p1',
    isRecurring: true,
    status: 'PUBLISHED',
    recurringRule: 'FREQ=DAILY;COUNT=3',
    startDateTime: start,
    endDateTime: new Date(start.getTime() + 3_600_000),
    ticketTypes: [],
  };
  let calls = 0;
  const tx = {
    event: {
      create: jest.fn(async () => {
        calls += 1;
        const err = opts.createFails?.(calls);
        if (err) throw err;
        return { id: `occ${calls}` };
      }),
    },
    eventTicketType: { createMany: jest.fn() },
  };
  const prisma = {
    event: {
      findUnique: jest.fn().mockResolvedValue(parent),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const redis = { runExclusive: jest.fn() };
  const svc = new RecurrenceService(prisma as any, redis as any);
  return { svc, prisma, redis, tx };
}

describe('RecurrenceService (S22)', () => {
  it('skips a slot another replica created first (unique violation) and keeps going', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { svc, tx } = setup({ createFails: (n) => (n === 1 ? dup : null) });
    jest
      .spyOn(svc as any, 'occurrenceDataFromParent')
      .mockReturnValue({});
    const created = await svc.generateOccurrences('p1');
    expect(tx.event.create).toHaveBeenCalledTimes(3);
    expect(created).toBe(2);
  });

  it('rethrows any other create error', async () => {
    const { svc } = setup({ createFails: () => new Error('db down') });
    jest
      .spyOn(svc as any, 'occurrenceDataFromParent')
      .mockReturnValue({});
    await expect(svc.generateOccurrences('p1')).rejects.toThrow('db down');
  });

  it('runs the daily reconcile only on the replica that wins the lock', async () => {
    const { svc, redis } = setup();
    const reconcile = jest
      .spyOn(svc, 'reconcileAllSeries')
      .mockResolvedValue(undefined);

    redis.runExclusive.mockResolvedValueOnce(false);
    await svc.dailyReconcile();
    expect(reconcile).not.toHaveBeenCalled();

    redis.runExclusive.mockImplementationOnce(
      async (_k: string, _t: number, task: () => Promise<void>) => {
        await task();
        return true;
      },
    );
    await svc.dailyReconcile();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(redis.runExclusive.mock.calls[0][0]).toMatch(
      /^cron:recurrenceReconcile:\d{4}-\d{2}-\d{2}$/,
    );
  });
});
