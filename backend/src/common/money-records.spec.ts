import { BadRequestException } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { SpacesService } from '../spaces/spaces.service';

/**
 * S14: deleting a cancelled event / session, or a space, cascades over paid
 * registrations, refund requests and stay bookings. Refuse while any exist.
 */

function db(counts: Partial<Record<'reg' | 'refund' | 'stay' | 'payout' | 'session' | 'addon', number>> = {}) {
  const prisma = {
    eventRegistration: { count: jest.fn(async () => counts.reg ?? 0), deleteMany: jest.fn(async () => ({ count: 0 })) },
    refundRequest: { count: jest.fn(async () => counts.refund ?? 0) },
    stayBooking: { count: jest.fn(async () => counts.stay ?? 0), deleteMany: jest.fn(async () => ({ count: 0 })) },
    payout: { count: jest.fn(async () => counts.payout ?? 0) },
    sessionRegistration: { count: jest.fn(async () => counts.session ?? 0), deleteMany: jest.fn(async () => ({ count: 0 })) },
    groupSeatPurchase: { count: jest.fn(async () => counts.addon ?? 0), deleteMany: jest.fn(async () => ({ count: 0 })) },
    event: {
      findUnique: jest.fn(async () => ({ id: 'ev-1', slug: 'ev', spaceId: 'sp-1', status: EventStatus.CANCELLED })),
      delete: jest.fn(async () => ({ id: 'ev-1' })),
    },
    session: { delete: jest.fn(async () => ({})) },
    spaceDomain: { findMany: jest.fn(async () => []) },
    space: {
      findUnique: jest.fn(async () => ({ id: 'sp-1', _count: { childSpaces: 0 } })),
      delete: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

function events(prisma: ReturnType<typeof db>) {
  const s = Object.create(EventsService.prototype);
  Object.assign(s, {
    prisma,
    cache: { invalidateEventCache: jest.fn() },
    authz: { can: jest.fn(async () => true) },
    storageService: { deletePrefix: jest.fn(async () => 0) },
  });
  s.canManageEvent = jest.fn(async () => true);
  return s as EventsService;
}

describe('delete is refused while money rows exist (S14)', () => {
  it('a cancelled event with a paid (since refunded) registration is not deleted', async () => {
    const prisma = db({ reg: 1 });
    await expect(events(prisma).permanentDeleteEvent('u', 'ev-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.event.delete).not.toHaveBeenCalled();
    // Counted by a taken payment, not by status alone: free rows carry no paymentId.
    expect(prisma.eventRegistration.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ event: { id: 'ev-1' }, paymentId: { not: null } }),
    });
  });

  it('a refund request or a stay booking also blocks it', async () => {
    for (const counts of [{ refund: 1 }, { stay: 1 }, { addon: 1 }]) {
      const prisma = db(counts);
      await expect(events(prisma).permanentDeleteEvent('u', 'ev-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.event.delete).not.toHaveBeenCalled();
    }
  });

  it('counts extra-seats payments through their registration (S52)', async () => {
    const prisma = db({ addon: 1 });
    await expect(events(prisma).permanentDeleteEvent('u', 'ev-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.groupSeatPurchase.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ registration: { event: { id: 'ev-1' } }, paymentId: { not: null } }),
    });
  });

  it('a cancelled event with no money rows is deleted', async () => {
    const prisma = db();
    await events(prisma).permanentDeleteEvent('u', 'ev-1');
    expect(prisma.event.delete).toHaveBeenCalled();
  });

  it('a space with money rows under it is not deleted', async () => {
    const prisma = db({ payout: 1 });
    const s = Object.create(SpacesService.prototype);
    Object.assign(s, { prisma });
    await expect(s.deleteSpace('sp-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.space.delete).not.toHaveBeenCalled();
    expect(prisma.payout.count).toHaveBeenCalledWith({ where: { event: { spaceId: 'sp-1' } } });
  });
});

describe('money rows RESTRICT their parents, one guard clears the rest (A29)', () => {
  const unpaid = { NOT: expect.objectContaining({ paymentId: { not: null } }) };

  it('clears only unpaid rows, inside the transaction, before the event delete', async () => {
    const prisma = db();
    await events(prisma).permanentDeleteEvent('u', 'ev-1');
    const scope = { event: { id: 'ev-1' } };
    expect(prisma.groupSeatPurchase.deleteMany).toHaveBeenCalledWith({ where: { registration: scope, ...unpaid } });
    expect(prisma.stayBooking.deleteMany).toHaveBeenCalledWith({ where: { ...scope, ...unpaid } });
    expect(prisma.eventRegistration.deleteMany).toHaveBeenCalledWith({ where: { ...scope, ...unpaid } });
    const order = (m: jest.Mock) => m.mock.invocationCallOrder[0];
    expect(order(prisma.eventRegistration.deleteMany)).toBeLessThan(order(prisma.event.delete));
  });

  it('a space delete clears both its events\' and its sessions\' unpaid rows', async () => {
    const prisma = db();
    const s = Object.create(SpacesService.prototype);
    Object.assign(s, { prisma });
    await s.deleteSpace('sp-1');
    expect(prisma.eventRegistration.deleteMany).toHaveBeenCalledWith({ where: { event: { spaceId: 'sp-1' }, ...unpaid } });
    expect(prisma.sessionRegistration.deleteMany).toHaveBeenCalledWith({ where: { session: { spaceId: 'sp-1' }, ...unpaid } });
    expect(prisma.space.delete).toHaveBeenCalled();
  });

  it('a payment landing after the check trips the foreign key: same clear error, not a 500', async () => {
    const prisma = db();
    prisma.space.delete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );
    const s = Object.create(SpacesService.prototype);
    Object.assign(s, { prisma });
    await expect(s.deleteSpace('sp-1')).rejects.toThrow('This space has payment, refund or payout records');
  });
});
