import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { EventSchedulerService } from './event-scheduler.service';
import { END_GRACE_MS } from './event-dates';

/**
 * Q26: check-in stays open for END_GRACE_MS after a late event's end time; the
 * hourly job completes it after that, and End event completes it at once.
 */
function build(opts: { claimed?: number; allowed?: boolean } = {}) {
  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => ({ id: 'ev-1', slug: 'fest' })),
      updateMany: jest.fn(async () => ({ count: opts.claimed ?? 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'ev-1', status: EventStatus.COMPLETED })),
    },
  };
  const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
  const authz: any = { can: jest.fn(async () => opts.allowed ?? true) };
  const svc = new EventsService(prisma, {} as any, {} as any, cache, {} as any, {} as any, { emit: jest.fn() } as any, authz, {} as any);
  return { svc, prisma, cache, authz };
}

describe('End event (Q26)', () => {
  it('completes a live event that has started, now', async () => {
    const { svc, prisma, cache, authz } = build();
    const out = await svc.endEvent('u-1', 'ev-1');
    expect(authz.can).toHaveBeenCalledWith({ id: 'u-1' }, 'event:publish', { eventId: 'ev-1' });
    const { where, data } = prisma.event.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({
      id: 'ev-1',
      status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
      isRecurring: false,
    });
    expect(where.startDateTime.lte.getTime()).toBeLessThanOrEqual(Date.now());
    expect(data).toEqual({ status: EventStatus.COMPLETED });
    expect(cache.invalidateEventCache).toHaveBeenCalledWith('fest');
    expect(out.status).toBe(EventStatus.COMPLETED);
  });

  it('refuses a draft, finished or not-yet-started event', async () => {
    await expect(build({ claimed: 0 }).svc.endEvent('u-1', 'ev-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('needs event:publish', async () => {
    const { svc, prisma } = build({ allowed: false });
    await expect(svc.endEvent('u-1', 'ev-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.event.updateMany).not.toHaveBeenCalled();
  });
});

describe('auto-complete waits out the grace (Q26)', () => {
  it('only completes events that ended more than END_GRACE_MS ago', async () => {
    const prisma: any = { event: { updateMany: jest.fn(async () => ({ count: 0 })) } };
    const redis: any = { runExclusive: jest.fn((_k: string, _t: number, fn: () => Promise<void>) => fn()) };
    const before = Date.now();
    await new EventSchedulerService(prisma, {} as any, redis).markCompletedEvents();
    const { where } = prisma.event.updateMany.mock.calls[0][0];
    const cutoff = where.endDateTime.lte.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - END_GRACE_MS);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - END_GRACE_MS);
  });
});
