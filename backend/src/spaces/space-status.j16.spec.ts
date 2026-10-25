import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SpaceStatus } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { buildRegistrationsService } from '../registrations/registrations.testing';
import { canViewSpace, isSpaceLive, PUBLIC_LIVE_SPACE_WHERE, visibleSpacesWhere } from './space-access';

/**
 * J16: a space taken down (SUSPENDED, ARCHIVED, REJECTED, INACTIVE, PENDING)
 * disappears from public lists and pages and can't publish or sell. PUBLIC
 * events of a PRIVATE space stay out of the public feed.
 */

describe('publicly live (J16)', () => {
  it('only APPROVED and ACTIVE are live', () => {
    const live = Object.values(SpaceStatus).filter(isSpaceLive);
    expect(live.sort()).toEqual([SpaceStatus.ACTIVE, SpaceStatus.APPROVED]);
  });

  it('anonymous listings get public live spaces only', () => {
    expect(visibleSpacesWhere()).toEqual(PUBLIC_LIVE_SPACE_WHERE);
    expect(PUBLIC_LIVE_SPACE_WHERE).toEqual({ status: { in: ['APPROVED', 'ACTIVE'] }, visibility: 'PUBLIC' });
  });

  it('a suspended public space is visible to its members only', async () => {
    const prisma: any = { userRole: { findFirst: jest.fn(async ({ where }: any) => (where.userId === 'member' ? { id: 'r' } : null)) } };
    const space = { id: 'sp-1', visibility: 'PUBLIC' as const, status: SpaceStatus.SUSPENDED };
    expect(await canViewSpace(prisma, space, undefined)).toBe(false);
    expect(await canViewSpace(prisma, space, 'stranger')).toBe(false);
    expect(await canViewSpace(prisma, space, 'member')).toBe(true);
    expect(await canViewSpace(prisma, { ...space, status: SpaceStatus.APPROVED }, undefined)).toBe(true);
  });
});

function events(space: { visibility: string; status: SpaceStatus }, event: Record<string, unknown> = {}) {
  const row = {
    id: 'ev-1',
    slug: 'fest',
    spaceId: 'sp-1',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    deletedAt: null,
    onlineUrl: null,
    ticketTypes: [],
    ...event,
  };
  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => row),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      update: jest.fn(async () => row),
    },
    space: {
      findUnique: jest.fn(async () => ({ id: 'sp-1', ...space })),
      findFirst: jest.fn(async () => ({ status: space.status })),
    },
    userRole: { findFirst: jest.fn(async () => null) },
    eventCoHost: { findMany: jest.fn(async () => []) },
    eventRegistration: { count: jest.fn(async () => 0) },
  };
  const cache: any = {
    getCachedEvent: jest.fn(async () => row),
    incrementEventViews: jest.fn(async () => undefined),
    invalidateEventCache: jest.fn(async () => undefined),
  };
  const authz: any = { can: jest.fn(async () => true), canAny: jest.fn(async () => false) };
  const svc = new EventsService(prisma, {} as any, {} as any, cache, {} as any, {} as any, { emit: jest.fn() } as any, authz, {} as any);
  return { svc, prisma, authz };
}

describe('events of a space that is not publicly live (J16)', () => {
  it('the public feed only takes events from public live spaces', async () => {
    const { svc, prisma } = events({ visibility: 'PRIVATE', status: SpaceStatus.ACTIVE });
    await svc.getEvents({} as any);
    expect(prisma.event.findMany.mock.calls[0][0].where.space).toEqual(PUBLIC_LIVE_SPACE_WHERE);
  });

  it('a PUBLIC event of a PRIVATE space 404s for outsiders', async () => {
    const { svc } = events({ visibility: 'PRIVATE', status: SpaceStatus.ACTIVE });
    await expect(svc.getEventBySlug('fest')).rejects.toThrow(NotFoundException);
  });

  it('an event of a suspended space is "temporarily unavailable", but not to a ticket holder', async () => {
    const { svc, prisma, authz } = events({ visibility: 'PUBLIC', status: SpaceStatus.SUSPENDED });
    authz.can.mockResolvedValue(false);
    await expect(svc.getEventBySlug('fest')).rejects.toThrow(ForbiddenException);
    prisma.eventRegistration.count.mockResolvedValue(1);
    await expect(svc.getEventBySlug('fest', 'holder')).resolves.toMatchObject({ id: 'ev-1' });
  });

  it('publish is refused and nothing is written', async () => {
    const { svc, prisma } = events({ visibility: 'PUBLIC', status: SpaceStatus.SUSPENDED }, { status: 'DRAFT' });
    await expect(svc.publishEvent('curator', 'ev-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('create-order is refused before any seat or order', async () => {
    const prisma: any = {
      event: { findUnique: jest.fn(async () => ({ id: 'ev-1', spaceId: 'sp-1', visibility: 'PUBLIC', status: 'PUBLISHED', ticketTypes: [], registrations: [], space: { status: SpaceStatus.SUSPENDED } })) },
      space: { findFirst: jest.fn(async () => ({ status: SpaceStatus.SUSPENDED })) },
    };
    const payments = { createOrder: jest.fn() };
    const svc = buildRegistrationsService(
      prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
      payments as any, {} as any, { emit: jest.fn() } as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, { can: async () => true } as any,
    );
    await expect(svc.createPaymentOrder('ev-1', 'buyer', { ticketTypeId: 'tt-1', quantity: 1 } as any)).rejects.toThrow(
      'This space is temporarily unavailable',
    );
    expect(payments.createOrder).not.toHaveBeenCalled();
  });
});
