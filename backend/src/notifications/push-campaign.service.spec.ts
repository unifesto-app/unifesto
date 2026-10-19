import { PushCampaignService } from './push-campaign.service';

/** The confirm step's audience count and send-to-me test (no DB, no OneSignal). */
describe('PushCampaignService confirm step', () => {
  const build = (prisma: any, notifications: any) =>
    new PushCampaignService(prisma, notifications, {} as any);

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

  it('an all-users product update goes to an enumerated, pref-filtered list with inbox copies', async () => {
    const prisma = {
      pushCampaign: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c1',
          scope: 'PLATFORM',
          category: 'productUpdates',
          title: 'New',
          body: 'Hello',
          data: {},
          targetSegment: { type: 'all' },
        }),
        update: jest.fn(),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]) },
    };
    const notifications = { send: jest.fn().mockResolvedValue({ sent: 2, failed: 0, skipped: 0 }) };
    await build(prisma, notifications).dispatch('c1');
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { deletedAt: null }, select: { id: true } });
    expect(notifications.send).toHaveBeenCalledWith(
      ['a', 'b'],
      expect.objectContaining({ category: 'productUpdates', campaignId: 'c1' }),
    );
    expect(notifications.send.mock.calls[0][1].inbox).toBeUndefined(); // inbox on by default
  });
});
