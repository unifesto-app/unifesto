import { EventStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { FavoritesService } from '../favorites/favorites.service';
import { SessionsService } from '../sessions/sessions.service';
import { rateCardTerms } from '../subscription/terms.testing';

/**
 * J9: anonymous event lists, favourites, the public event detail, the public
 * calendar.ics and the public session detail never carry private columns.
 */

const PRIVATE = ['onlineUrl', 'whatsappAttendeeGroupUrl', 'payoutBankAccountId', 'createdBy', 'displayToken'];

const row = {
  id: 'ev-1',
  slug: 'fest',
  title: 'Fest',
  description: null,
  spaceId: 'sp-1',
  status: EventStatus.PUBLISHED,
  visibility: 'PUBLIC',
  type: 'ONLINE',
  isRecurring: false,
  deletedAt: null,
  startDateTime: new Date('2026-12-01T10:00:00Z'),
  endDateTime: new Date('2026-12-01T12:00:00Z'),
  timezone: 'Asia/Kolkata',
  venueName: null,
  venueAddress: null,
  city: null,
  onlineUrl: 'https://meet.example/secret',
  whatsappAttendeeGroupUrl: 'https://chat.whatsapp.com/secret',
  payoutBankAccountId: 'bank-1',
  createdBy: 'u-owner',
  displayToken: 'projector-secret',
  ticketTypes: [],
  space: { name: 'Space', subscription: null, visibility: 'PUBLIC', status: 'ACTIVE' },
  creator: { fullName: 'Owner' },
};

function events(opts: { attending?: number } = {}) {
  const prisma: any = {
    event: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findUnique: jest.fn(async () => ({ ...row })),
    },
    eventRegistration: { count: jest.fn(async () => opts.attending ?? 0) },
    space: { findUnique: jest.fn(async () => null) },
    userRole: { findMany: jest.fn(async () => []) },
    eventCoHost: { findMany: jest.fn(async () => []) },
    eventSponsor: { findMany: jest.fn(async () => []) },
  };
  const cache: any = {
    getCachedEvent: jest.fn(async () => null),
    setCachedEvent: jest.fn(async () => undefined),
    incrementEventViews: jest.fn(async () => undefined),
  };
  const authz: any = { can: jest.fn(async () => false), canAny: jest.fn(async () => false) };
  const svc = new EventsService(prisma, {} as any, {} as any, cache, {} as any, {} as any, { emit: jest.fn() } as any, authz, {} as any);
  return { svc, prisma };
}

/** The columns a findMany asked for: an explicit select, never a bare include. */
function selected(args: any) {
  expect(args.include).toBeUndefined();
  return Object.keys(args.select);
}

describe('public event fields (J9)', () => {
  it('GET /events selects card columns only', async () => {
    const { svc, prisma } = events();
    await svc.getEvents({} as any);
    const cols = selected(prisma.event.findMany.mock.calls[0][0]);
    for (const f of PRIVATE) expect(cols).not.toContain(f);
    expect(cols).toEqual(expect.arrayContaining(['id', 'title', 'slug', 'startDateTime', 'ticketTypes']));
  });

  it("a space's event list selects card columns only", async () => {
    const { svc, prisma } = events();
    jest.spyOn(svc as any, 'isSpaceInsider').mockResolvedValue(true);
    jest.spyOn(svc as any, 'attendeeBreakdowns').mockResolvedValue(new Map());
    await svc.getSpaceEvents('sp-1');
    const cols = selected(prisma.event.findMany.mock.calls[0][0]);
    for (const f of PRIVATE) expect(cols).not.toContain(f);
  });

  it('favourites select card columns only', async () => {
    const prisma: any = { favoriteEvent: { findMany: jest.fn(async () => []) } };
    await new FavoritesService(prisma).getFavorites('u-1');
    const cols = Object.keys(prisma.favoriteEvent.findMany.mock.calls[0][0].include.event.select);
    for (const f of PRIVATE) expect(cols).not.toContain(f);
  });

  it('the public detail hides the join link and private columns from outsiders', async () => {
    const { svc } = events();
    const anon: any = await svc.getEventBySlug('fest');
    expect(anon.onlineUrl).toBeNull();
    for (const f of ['whatsappAttendeeGroupUrl', 'payoutBankAccountId', 'displayToken']) expect(anon).not.toHaveProperty(f);

    const stranger: any = await events({ attending: 0 }).svc.getEventBySlug('fest', 'u-stranger');
    expect(stranger.onlineUrl).toBeNull();
  });

  it('a ticket holder gets the join link', async () => {
    const { svc, prisma } = events({ attending: 1 });
    const holder: any = await svc.getEventBySlug('fest', 'u-holder');
    expect(holder.onlineUrl).toBe(row.onlineUrl);
    expect(prisma.eventRegistration.count.mock.calls[0][0].where.eventId).toBe('ev-1');
  });

  it('the public calendar.ics never carries the join link', async () => {
    const { svc, prisma } = events();
    const ics = await svc.getEventIcs('fest');
    expect(prisma.event.findUnique.mock.calls[0][0].select.onlineUrl).toBeUndefined();
    expect(ics).not.toContain('meet.example');
  });
});

describe('public session fields (J9)', () => {
  const session = { id: 's-1', slug: 'talk', status: 'PUBLISHED', deletedAt: null };
  function sessions(registered: boolean) {
    const prisma: any = {
      session: { findUnique: jest.fn(async () => ({ ...session })) },
      sessionRegistration: {
        findFirst: jest.fn(async () => (registered ? { session: { recordingUrl: 'https://rec/1' } } : null)),
      },
    };
    const svc = new SessionsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, rateCardTerms());
    return { svc, prisma };
  }

  it('publicSelect has no recordingUrl', () => {
    expect((sessions(false).svc as any).publicSelect.recordingUrl).toBeUndefined();
  });

  it('the recording is added only for a registrant', async () => {
    expect(await sessions(false).svc.getPublicSession('talk', 'u-1')).not.toHaveProperty('recordingUrl');
    expect(await sessions(true).svc.getPublicSession('talk')).not.toHaveProperty('recordingUrl');
    expect(await sessions(true).svc.getPublicSession('talk', 'u-1')).toHaveProperty('recordingUrl', 'https://rec/1');
  });
});
