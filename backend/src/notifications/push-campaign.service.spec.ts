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
    expect(notifications.countAllowed).toHaveBeenCalledWith(['admin-1'], 'productUpdates');
  });

  it("reads a segment broadcast's sent/failed back from OneSignal when listing", async () => {
    const old = new Date('2026-09-26T19:06:16Z');
    const items = [
      { id: 'c1', status: 'SENT', oneSignalId: 'os-1', sentAt: old, sentCount: 0, failedCount: 0 },
      { id: 'c2', status: 'SENT', oneSignalId: 'os-2', sentAt: old, sentCount: 900, failedCount: 1 }, // settled
      { id: 'c3', status: 'SENT', oneSignalId: null, sentAt: new Date(), sentCount: 4, failedCount: 0 }, // enumerated
    ];
    const prisma = {
      pushCampaign: {
        findMany: jest.fn().mockResolvedValue(items),
        count: jest.fn().mockResolvedValue(3),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const oneSignal = { getDeliveryStats: jest.fn().mockResolvedValue({ successful: 1126, failed: 15, errored: 2 }) };
    const res = await build(prisma, {}, oneSignal).list();
    expect(oneSignal.getDeliveryStats).toHaveBeenCalledTimes(1);
    expect(oneSignal.getDeliveryStats).toHaveBeenCalledWith('os-1');
    expect(res.items[0]).toMatchObject({ sentCount: 1126, failedCount: 17 });
    expect(prisma.pushCampaign.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { sentCount: 1126, failedCount: 17 },
    });
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
});
