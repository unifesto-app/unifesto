import { PushCampaignService } from './push-campaign.service';

/** The confirm step's audience count and send-to-me test (no DB, no OneSignal). */
describe('PushCampaignService confirm step', () => {
  const build = (prisma: any, notifications: any, oneSignal: any = {}) =>
    new PushCampaignService(prisma, notifications, {} as any, oneSignal);

  it('staff audience is platform ADMINs only', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]) } };
    const notifications = { countAllowed: jest.fn().mockResolvedValue(1) };
    await build(prisma, notifications).countAudience({ type: 'staff' });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      roles: { some: { role: { code: 'ADMIN' }, spaceId: null, eventId: null } },
    });
    expect(notifications.countAllowed).toHaveBeenCalledWith(['admin-1'], 'adminAlerts');
  });

  it('lists stored counts at once and refreshes segment stats in the background, rate-limited', async () => {
    const now = Date.now();
    const ago = (ms: number) => new Date(now - ms);
    const H = 60 * 60 * 1000;
    const row = (id: string, extra: object) => ({
      id, status: 'SENT', oneSignalId: `os-${id}`, sentAt: ago(2 * H), updatedAt: ago(H), sentCount: 0, failedCount: 0, ...extra,
    });
    const items = [
      row('fresh', {}), // read: sent today
      row('same', { sentCount: 10, failedCount: 1 }), // read, numbers unchanged: no UPDATE
      row('settled', { sentAt: ago(48 * H), sentCount: 900 }), // past the first day with counts: skipped
      row('recent', { updatedAt: ago(60 * 1000) }), // touched a minute ago: skipped
      row('old', { sentAt: ago(31 * 24 * H) }), // past 30 days: skipped
      row('plain', { oneSignalId: null }), // enumerated send: skipped
    ];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const oneSignal = {
      getDeliveryStats: jest.fn(async (id: string) => {
        await gate;
        return id === 'os-same' ? { successful: 10, failed: 1, errored: 0 } : { successful: 1126, failed: 15, errored: 2 };
      }),
    };
    const prisma = {
      pushCampaign: {
        findMany: jest.fn().mockResolvedValue(items),
        count: jest.fn().mockResolvedValue(items.length),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = build(prisma, {}, oneSignal);
    // The list doesn't wait on OneSignal.
    const res = await svc.list();
    expect(res.items[0].sentCount).toBe(0);
    release();
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    expect(oneSignal.getDeliveryStats.mock.calls.map((c) => c[0]).sort()).toEqual(['os-fresh', 'os-same']);
    expect(prisma.pushCampaign.update).toHaveBeenCalledTimes(1);
    expect(prisma.pushCampaign.update).toHaveBeenCalledWith({
      where: { id: 'fresh' },
      data: { sentCount: 1126, failedCount: 17 },
    });
    // A second view inside 5 minutes reads nothing again.
    await svc.refreshSegmentStats(items as any);
    expect(oneSignal.getDeliveryStats).toHaveBeenCalledTimes(2);
  });

  it('marks a segment broadcast FAILED when OneSignal accepts nothing (no id)', async () => {
    const prisma = {
      pushCampaign: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c1', scope: 'PLATFORM', category: 'productUpdates', title: 'T', body: 'B', data: null, targetSegment: { type: 'all' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const notifications = {
      sendToSegments: jest.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: 0, oneSignalId: null }),
    };
    await build(prisma, notifications).dispatch('c1');
    expect(prisma.pushCampaign.update.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', sentAt: null });
  });

  it('a staff test run is marked [Test], kept out of the inbox and sent as a staff alert', async () => {
    const prisma = {
      pushCampaign: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c2', scope: 'PLATFORM', category: 'promotions', title: 'Launch', body: 'B', data: null, targetSegment: { type: 'staff' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]) },
    };
    const notifications = { send: jest.fn().mockResolvedValue({ sent: 1, failed: 0, skipped: 0 }) };
    await build(prisma, notifications).dispatch('c2');
    expect(notifications.send).toHaveBeenCalledWith(
      ['admin-1'],
      expect.objectContaining({ title: '[Test] Launch', category: 'adminAlerts', inbox: false }),
    );
    expect(prisma.pushCampaign.update.mock.calls[0][0].data.status).toBe('SENT');
  });

  it('counts space members (distinct) through the same pref filter as the send', async () => {
    const prisma = {
      userRole: { findMany: jest.fn().mockResolvedValue([{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }]) },
    };
    const notifications = { countAllowed: jest.fn().mockResolvedValue(1) };
    await expect(
      build(prisma, notifications).countAudience({ type: 'space', spaceId: 's1' }, 'promotions'),
    ).resolves.toEqual({ recipientCount: 1 });
    expect(notifications.countAllowed).toHaveBeenCalledWith(['a', 'b'], 'promotions');
  });

  it('an event audience is the booking holders plus group members who joined (C9)', async () => {
    const prisma = {
      eventRegistration: { findMany: jest.fn().mockResolvedValue([{ userId: 'lead' }]) },
      groupSeat: { findMany: jest.fn().mockResolvedValue([{ claimedByUserId: 'lead' }, { claimedByUserId: 'mem' }]) },
    };
    const notifications = { countAllowed: jest.fn().mockResolvedValue(2) };
    await build(prisma, notifications).countAudience({ type: 'event', eventId: 'ev-1' });
    expect(notifications.countAllowed).toHaveBeenCalledWith(['lead', 'mem'], 'productUpdates');
    expect(prisma.groupSeat.findMany.mock.calls[0][0].where).toMatchObject({
      status: 'CLAIMED',
      registration: { eventId: 'ev-1', isWaitlisted: false },
    });
  });

  it('defaults to the product-updates category and counts nothing for a missing id', async () => {
    const notifications = { countAllowed: jest.fn().mockResolvedValue(0) };
    await build({}, notifications).countAudience({ type: 'event' });
    expect(notifications.countAllowed).toHaveBeenCalledWith([], 'productUpdates');
  });

  it('sends a test only to the admin, marked as a test and kept out of the feed', async () => {
    const notifications = { send: jest.fn().mockResolvedValue({ sent: 1, failed: 0, skipped: 0 }) };
    await build({}, notifications).sendTest('admin-1', { title: 'Big news', body: 'Hello' });
    expect(notifications.send).toHaveBeenCalledWith(
      ['admin-1'],
      expect.objectContaining({ title: '[Test] Big news', body: 'Hello', inbox: false, category: 'adminAlerts' }),
    );
  });

  it('an all-users promotion goes per-user (opt-in, inbox copies, open accounts only), never to the segment', async () => {
    const prisma = {
      pushCampaign: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c1',
          scope: 'PLATFORM',
          category: 'promotions',
          title: 'New',
          body: 'Hello',
          data: {},
          targetSegment: { type: 'all' },
        }),
        update: jest.fn(),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]) },
    };
    const notifications = {
      send: jest.fn().mockResolvedValue({ sent: 2, failed: 0, skipped: 0 }),
      sendToSegments: jest.fn(),
    };
    await build(prisma, notifications).dispatch('c1');
    expect(notifications.sendToSegments).not.toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { deletedAt: null }, select: { id: true } });
    expect(notifications.send).toHaveBeenCalledWith(
      ['a', 'b'],
      expect.objectContaining({ category: 'promotions', campaignId: 'c1' }),
    );
    expect(notifications.send.mock.calls[0][1].inbox).toBeUndefined(); // inbox on by default
  });
});
