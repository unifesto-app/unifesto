import { EventsService } from './events.service';

/** K8: public lists include live events, and past ones when asked. */
describe('public event lists: upcoming vs past', () => {
  const prisma: any = {
    event: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    space: { findUnique: jest.fn(async () => ({ id: 'sp-1', visibility: 'PUBLIC', status: 'ACTIVE' })) },
  };
  const svc = new EventsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  (svc as any).isSpaceInsider = async () => false;
  const lastQuery = () => prisma.event.findMany.mock.calls.at(-1)[0];

  it('defaults to live and upcoming, soonest first', async () => {
    await svc.getEvents({});
    const q = lastQuery();
    expect(q.where.status).toEqual({ in: ['PUBLISHED', 'ONGOING'] });
    expect(q.where.endDateTime).toBeUndefined();
    expect(q.orderBy).toEqual({ startDateTime: 'asc' });
  });

  it('past = ended by the clock (even if not yet COMPLETED), newest first', async () => {
    await svc.getEvents({ when: 'past', endDate: '2026-01-01T00:00:00Z' });
    const q = lastQuery();
    expect(q.where.status).toEqual({ in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] });
    expect(q.where.endDateTime.lt).toBeInstanceOf(Date);
    expect(q.where.endDateTime.lte).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(q.orderBy).toEqual({ startDateTime: 'desc' });
  });

  it('space page: outsiders get live events, plus finished ones only on opt-in', async () => {
    await svc.getSpaceEvents('sp-1', 1, 20, 'DRAFT' as any);
    expect(lastQuery().where.status).toEqual({ in: ['PUBLISHED', 'ONGOING'] });

    await svc.getSpaceEvents('sp-1', 1, 20, 'DRAFT' as any, 'active', undefined, true);
    expect(lastQuery().where.status).toEqual({ in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] });
  });

  it('marks white-labelled events with their live custom domain (K2 sitemap)', async () => {
    const space = (whiteLabelEnabled: boolean) => ({
      id: 'sp-1', name: 'S', slug: 's', logoUrl: null, whiteLabelEnabled, brandingSuspendedAt: null,
      domains: [{ hostname: 'fest.example.org' }], subscription: { plan: 'PRO' },
    });
    prisma.event.findMany.mockResolvedValueOnce([
      { id: 'e1', ticketTypes: [], childEvents: [], space: space(true) },
      { id: 'e2', ticketTypes: [], childEvents: [], space: space(false) },
    ]);
    const planConfig = { getEffectiveLimits: () => ({ hasRemoveBranding: true }) };
    const branded = new EventsService(prisma, {} as any, {} as any, {} as any, {} as any, planConfig as any, {} as any, {} as any, {} as any);
    (branded as any).isSpaceInsider = async () => false;
    const { data } = await branded.getEvents({});
    expect(data.map((e: any) => e.customDomain)).toEqual(['fest.example.org', null]);
    // The plan/domain internals stay off the public payload.
    expect(data[0].space).toEqual({ id: 'sp-1', name: 'S', slug: 's', logoUrl: null });
  });
});
