import { NotificationsService } from './notifications.service';

describe('NotificationsService in-app copy', () => {
  const build = () => {
    const prisma: any = {
      notificationSettings: { findMany: jest.fn().mockResolvedValue([]) },
      pushLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userNotification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const oneSignal: any = { send: jest.fn().mockResolvedValue({ id: 'n1' }) };
    return { svc: new NotificationsService(prisma, oneSignal), prisma, oneSignal };
  };

  const opts = {
    category: 'registrationUpdates' as const,
    title: 'Your room is Lab 2',
    body: 'Head to Lab 2.',
    deepLink: 'unifesto://hackathon/e1',
    data: { type: 'hackathon' },
    inbox: { type: 'hackathon', eventId: 'e1' },
  };

  it('keeps an in-app copy even for someone with push switched off', async () => {
    const { svc, prisma, oneSignal } = build();
    prisma.notificationSettings.findMany.mockResolvedValue([
      { userId: 'u-off', pushEnabled: false, registrationUpdates: true },
    ]);
    await svc.send(['u-on', 'u-off', 'u-on'], opts);

    const rows = prisma.userNotification.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => r.userId)).toEqual(['u-on', 'u-off']);
    expect(rows[0]).toMatchObject({ eventId: 'e1', type: 'hackathon', title: opts.title, deepLink: opts.deepLink });
    // …while the push itself still honours the preference.
    expect(oneSignal.send.mock.calls[0][0].externalIds).toEqual(['u-on']);
  });

  it('writes nothing to the feed without `inbox`', async () => {
    const { svc, prisma } = build();
    const { inbox: _inbox, ...plain } = opts;
    await svc.send(['u-on'], plain);
    expect(prisma.userNotification.createMany).not.toHaveBeenCalled();
  });

  it('still pushes when the feed write fails', async () => {
    const { svc, prisma, oneSignal } = build();
    prisma.userNotification.createMany.mockRejectedValue(new Error('db down'));
    const summary = await svc.send(['u-on'], opts);
    expect(oneSignal.send).toHaveBeenCalled();
    expect(summary.sent).toBe(1);
  });
});
