import { BadRequestException } from '@nestjs/common';
import { SpaceStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { publishBlockedMessage, publishMustHaves, type PublishCheckEvent } from './publish-must-haves';

/** Q22 (decision E): publishing needs a cover, a venue or joining link, and one ticket. */
const ready: PublishCheckEvent = {
  type: 'IN_PERSON',
  registrationType: 'TICKETED',
  coverImageUrl: 'https://cdn/x.jpg',
  venueName: 'Block C',
  venueAddress: null,
  onlineUrl: null,
  ticketCount: 1,
  subEventCount: 0,
};

describe('publishMustHaves (Q22)', () => {
  it('passes an event with all three', () => {
    expect(publishMustHaves(ready)).toEqual([]);
  });

  it('names each missing part in curator words', () => {
    expect(publishMustHaves({ ...ready, coverImageUrl: ' ', venueName: null, ticketCount: 0 })).toEqual([
      'a cover image',
      'a venue',
      'a ticket',
    ]);
    expect(publishMustHaves({ ...ready, registrationType: 'RSVP', ticketCount: 0 })).toEqual(['an RSVP option']);
  });

  it('wants the place the format needs', () => {
    expect(publishMustHaves({ ...ready, venueName: null, venueAddress: '12 MG Road' })).toEqual([]);
    expect(publishMustHaves({ ...ready, type: 'ONLINE' })).toEqual(['a joining link']);
    expect(publishMustHaves({ ...ready, type: 'ONLINE', venueName: null, onlineUrl: 'https://meet.google.com/x' })).toEqual([]);
    expect(publishMustHaves({ ...ready, type: 'HYBRID', venueName: null })).toEqual(['a venue or joining link']);
    expect(publishMustHaves({ ...ready, type: 'HYBRID', venueName: null, onlineUrl: 'https://zoom.us/j/1' })).toEqual([]);
  });

  it('lets a festival hub with sub-events go live without its own ticket', () => {
    expect(publishMustHaves({ ...ready, ticketCount: 0, subEventCount: 2 })).toEqual([]);
  });

  it('reads as one sentence, which old app builds show as is', () => {
    expect(publishBlockedMessage(['a ticket'])).toBe('Add a ticket before publishing.');
    expect(publishBlockedMessage(['a cover image', 'a venue', 'a ticket'])).toBe(
      'Add a cover image, a venue and a ticket before publishing.',
    );
  });
});

describe('publishEvent enforces it (Q22)', () => {
  const build = (event: Record<string, unknown>) => {
    const row = {
      id: 'ev-1',
      slug: 'fest',
      spaceId: 'sp-1',
      status: 'DRAFT',
      parentEventId: null,
      ...ready,
      _count: { ticketTypes: 1, childEvents: 0 },
      ...event,
    };
    const prisma: any = {
      event: { findUnique: jest.fn(async () => row), update: jest.fn(async () => ({ ...row, status: 'PUBLISHED' })) },
      space: { findFirst: jest.fn(async () => ({ status: SpaceStatus.ACTIVE })) },
      userRole: { findMany: jest.fn(async () => []) },
    };
    const authz: any = { can: jest.fn(async () => true) };
    const subscription: any = { incrementEventUsageForSpace: jest.fn(async () => undefined) };
    const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
    const svc = new EventsService(prisma, {} as any, subscription, cache, {} as any, {} as any, { emit: jest.fn() } as any, authz);
    return { svc, prisma };
  };

  it('refuses with what is missing and writes nothing', async () => {
    const { svc, prisma } = build({ coverImageUrl: null, _count: { ticketTypes: 0, childEvents: 0 } });
    const err = await svc.publishEvent('curator', 'ev-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe('Add a cover image and a ticket before publishing.');
    expect(prisma.event.update).not.toHaveBeenCalled();
    // Only active tickets and listed sub-events count: a hub of draft sub-events has nothing to register for.
    expect(prisma.event.findUnique.mock.calls[0][0].include._count.select).toEqual({
      ticketTypes: { where: { isActive: true } },
      childEvents: { where: { deletedAt: null, status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] } } },
    });
  });

  it('publishes an event that has all three', async () => {
    const { svc, prisma } = build({});
    await expect(svc.publishEvent('curator', 'ev-1')).resolves.toMatchObject({ status: 'PUBLISHED' });
    expect(prisma.event.update).toHaveBeenCalled();
  });
});
