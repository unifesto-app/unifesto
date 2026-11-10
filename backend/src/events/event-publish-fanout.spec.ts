import { EventPublishFanout } from './event-publish-fanout';

// J5: publish emails leave the request and are safe to re-run.
describe('EventPublishFanout', () => {
  const members = [
    { id: 'r1', userId: 'u1', user: { fullName: 'Asha', username: null, identities: [{ email: 'a@x.in' }] } },
    { id: 'r2', userId: 'u2', user: { fullName: null, username: 'bo', identities: [{ email: 'b@x.in' }] } },
    { id: 'r3', userId: 'u1', user: { fullName: 'Asha', username: null, identities: [{ email: 'a@x.in' }] } }, // 2nd role
    { id: 'r4', userId: 'u3', user: { fullName: 'No mail', username: null, identities: [] } },
    { id: 'r5', userId: 'u4', user: { fullName: 'Opted out', username: null, identities: [{ email: 'd@x.in' }] } },
  ];
  const build = () => {
    const prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'e1', spaceId: 's1', title: 'Fest', slug: 'fest', type: 'OFFLINE', venueName: null, city: 'Hyd',
          startDateTime: new Date('2026-11-01T04:30:00Z'), endDateTime: new Date('2026-11-01T07:30:00Z'),
          space: { name: 'Club' },
        }),
      },
      userRole: { findMany: jest.fn().mockResolvedValueOnce(members).mockResolvedValue([]) },
      notificationSettings: { findMany: jest.fn().mockResolvedValue([{ userId: 'u4' }]) },
    };
    const email = { sendEventPublished: jest.fn().mockResolvedValue(true) };
    const redis = { createClient: () => null, getClient: () => null };
    const fanout = new EventPublishFanout(prisma as any, redis as any, email as any);
    fanout.onModuleInit();
    return { fanout, email };
  };

  it('mails each member once, skipping no-email and opted-out, with a per-person dedup key', async () => {
    const { fanout, email } = build();
    await fanout.run('e1');
    expect(email.sendEventPublished).toHaveBeenCalledTimes(2);
    expect(email.sendEventPublished).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@x.in', userName: 'Asha', eventTitle: 'Fest', spaceName: 'Club' }),
      { dedupKey: 'event.published:e1:u1', kind: 'event.published', userId: 'u1' },
    );
    expect(email.sendEventPublished.mock.calls[1][1].dedupKey).toBe('event.published:e1:u2');
  });

  it('without Redis, enqueue still sends (inline, in the background)', async () => {
    const { fanout, email } = build();
    await fanout.enqueue('e1');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(email.sendEventPublished).toHaveBeenCalled();
  });

  describe('city alerts', () => {
    const event = (over: object = {}) => ({
      id: 'e1', spaceId: 's1', title: 'Fest', slug: 'fest', type: 'OFFLINE', venueName: 'T-Hub', city: ' Hyderabad ',
      status: 'PUBLISHED', visibility: 'PUBLIC', parentEventId: null, createdBy: 'creator', timezone: 'Asia/Kolkata',
      startDateTime: new Date('2026-11-01T04:30:00Z'), endDateTime: new Date('2026-11-01T07:30:00Z'),
      space: { name: 'Club' }, ...over,
    });
    const run = async (over: object = {}) => {
      const prisma: any = {
        event: { findUnique: jest.fn().mockResolvedValue(event(over)) },
        userRole: { findMany: jest.fn().mockResolvedValue([]) },
        user: { findMany: jest.fn().mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]).mockResolvedValue([]) },
      };
      const events = { emit: jest.fn() };
      await new EventPublishFanout(prisma, {} as any, {} as any, events as any).run('e1');
      return { prisma, events };
    };

    it('tells matching users, excluding space members and the creator, with a per-user dedup key', async () => {
      const { prisma, events } = await run();
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        newEventsCity: { equals: 'Hyderabad', mode: 'insensitive' },
        id: { not: 'creator' },
        roles: { none: { spaceId: 's1' } },
      });
      expect(events.emit).toHaveBeenCalledTimes(1);
      const [, batch] = events.emit.mock.calls[0];
      expect(batch.kind).toBe('city.new_event');
      expect(batch.items.map((i: any) => i.dedupKey)).toEqual(['city.new_event:e1:u1', 'city.new_event:e1:u2']);
      expect(batch.items[0].data).toMatchObject({ eventTitle: 'Fest', city: 'Hyderabad', venueName: 'T-Hub', spaceName: 'Club' });
    });

    it.each([
      ['online', { type: 'ONLINE' }],
      ['a sub-event', { parentEventId: 'parent' }],
      ['private', { visibility: 'PRIVATE' }],
      ['not live', { status: 'DRAFT' }],
      ['no city', { city: null }],
    ])('skips %s events', async (_n, over) => {
      const { prisma, events } = await run(over);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});
