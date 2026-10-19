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

  it('cuts an over-long title to the column size instead of losing the in-app copy', async () => {
    const { svc, prisma } = build();
    await svc.send(['u-on'], { ...opts, title: 'x'.repeat(250) });
    expect(prisma.userNotification.createMany.mock.calls[0][0].data[0].title).toHaveLength(200);
  });

  it('a segment broadcast returns the OneSignal id (its response has no recipient count)', async () => {
    const { svc } = build();
    await expect(svc.sendToSegments(['Total Subscriptions'], { title: 'T', body: 'B' })).resolves.toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
      oneSignalId: 'n1',
    });
  });

  it('inboxOnly: writes the in-app copy, sends no push and claims no dedup row', async () => {
    const { svc, prisma, oneSignal } = build();
    prisma.messageDelivery = { create: jest.fn(), createMany: jest.fn(), findUnique: jest.fn() };
    const res = await svc.send(['u-on'], { ...opts, inboxOnly: true, dedupKey: 'k:push' });
    expect(res).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(prisma.userNotification.createMany).toHaveBeenCalledTimes(1);
    expect(oneSignal.send).not.toHaveBeenCalled();
    expect(prisma.messageDelivery.create).not.toHaveBeenCalled();
    expect(prisma.pushLog.createMany).not.toHaveBeenCalled();
  });

  it('keeps a copy by default, typed from data', async () => {
    const { svc, prisma } = build();
    const { inbox: _inbox, ...plain } = opts;
    await svc.send(['u-on'], { ...plain, data: { type: 'registration', eventId: 'e2' } });
    expect(prisma.userNotification.createMany.mock.calls[0][0].data[0]).toMatchObject({ type: 'registration', eventId: 'e2' });
  });

  it('skips the feed for `inbox: false` and staff alerts', async () => {
    const { svc, prisma } = build();
    await svc.send(['u-on'], { ...opts, inbox: false });
    await svc.send(['u-on'], { ...opts, inbox: undefined, category: 'adminAlerts' });
    expect(prisma.userNotification.createMany).not.toHaveBeenCalled();
  });

  it('only opted-in users get a promotions copy', async () => {
    const { svc, prisma } = build();
    prisma.notificationSettings.findMany.mockResolvedValue([
      { userId: 'u-in', pushEnabled: true, promotions: true },
    ]);
    await svc.send(['u-in', 'u-none'], { ...opts, inbox: undefined, category: 'promotions' });
    expect(prisma.userNotification.createMany.mock.calls[0][0].data.map((r: any) => r.userId)).toEqual(['u-in']);
  });

  it('still pushes when the feed write fails', async () => {
    const { svc, prisma, oneSignal } = build();
    prisma.userNotification.createMany.mockRejectedValue(new Error('db down'));
    const summary = await svc.send(['u-on'], opts);
    expect(oneSignal.send).toHaveBeenCalled();
    expect(summary.sent).toBe(1);
  });
});

describe('NotificationsService.countAllowed', () => {
  it('counts distinct users the send would reach: opt-out on by default, opt-in off', async () => {
    const prisma: any = {
      notificationSettings: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'push-off', pushEnabled: false, productUpdates: true, promotions: true },
          { userId: 'promo-on', pushEnabled: true, productUpdates: false, promotions: true },
        ]),
      },
    };
    const svc = new NotificationsService(prisma, {} as any);
    const ids = ['no-row', 'push-off', 'promo-on', 'no-row'];
    await expect(svc.countAllowed(ids, 'productUpdates')).resolves.toBe(1);
    await expect(svc.countAllowed(ids, 'promotions')).resolves.toBe(1);
    await expect(svc.countAllowed([], 'promotions')).resolves.toBe(0);
  });
});

describe('NotificationsService delivery log (C3)', () => {
  const opts = { category: 'registrationUpdates' as const, title: 'Hi', body: 'There' };
  const withDeliveries = () => {
    const prisma: any = {
      notificationSettings: { findMany: jest.fn().mockResolvedValue([]) },
      pushLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userNotification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const oneSignal: any = { send: jest.fn().mockResolvedValue({ id: 'n1' }) };
    const b = { svc: new NotificationsService(prisma, oneSignal), prisma, oneSignal };
    b.prisma.messageDelivery = {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    return b;
  };

  it('writes one message_deliveries row per user next to PushLog', async () => {
    const { svc, prisma } = withDeliveries();
    prisma.notificationSettings.findMany.mockResolvedValue([
      { userId: 'u-off', pushEnabled: false, registrationUpdates: true },
    ]);
    await svc.send(['u-on', 'u-off'], opts);
    const rows = prisma.messageDelivery.createMany.mock.calls.flatMap((c: any[]) => c[0].data);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: 'PUSH', userId: 'u-off', status: 'SKIPPED' }),
        expect.objectContaining({ channel: 'PUSH', userId: 'u-on', status: 'SENT', providerMessageId: 'n1', attempts: 1 }),
      ]),
    );
  });

  it('a deduped single-user push sends nothing and writes no second inbox copy', async () => {
    const { svc, prisma, oneSignal } = withDeliveries();
    const { Prisma } = jest.requireActual('@prisma/client');
    prisma.messageDelivery.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' }),
    );
    const res = await svc.send(['u-on'], { ...opts, dedupKey: 'k:push' });
    expect(res).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(oneSignal.send).not.toHaveBeenCalled();
    expect(prisma.userNotification.createMany).not.toHaveBeenCalled();
  });

  it('a claimed push updates its dedup row instead of inserting', async () => {
    const { svc, prisma, oneSignal } = withDeliveries();
    await svc.send(['u-on'], { ...opts, dedupKey: 'k:push' });
    expect(oneSignal.send.mock.calls[0][0].idempotencyKey).toEqual(expect.any(String));
    expect(prisma.messageDelivery.update).toHaveBeenCalledWith({
      where: { dedupKey: 'k:push' },
      data: expect.objectContaining({ status: 'SENT', providerMessageId: 'n1' }),
    });
    expect(prisma.messageDelivery.createMany).not.toHaveBeenCalled();
  });

  it('a throw after the claim finishes the claimed row as FAILED', async () => {
    const { svc, prisma } = withDeliveries();
    prisma.notificationSettings.findMany.mockRejectedValue(new Error('db blip'));
    await svc.send(['u-on'], { ...opts, dedupKey: 'k:push' });
    expect(prisma.messageDelivery.update).toHaveBeenCalledWith({
      where: { dedupKey: 'k:push' },
      data: expect.objectContaining({ status: 'FAILED', error: 'db blip' }),
    });
  });
});

describe('NotificationsService quiet hours (C4)', () => {
  const build = () => {
    const prisma: any = {
      notificationSettings: {
        findMany: jest.fn().mockResolvedValue([
          // 22:00-07:00 IST
          { userId: 'u-quiet', pushEnabled: true, eventReminders: true, registrationUpdates: true, organiserAnnouncements: true, quietHoursStart: 1320, quietHoursEnd: 420 },
          { userId: 'u-awake', pushEnabled: true, eventReminders: true, registrationUpdates: true, organiserAnnouncements: true, quietHoursStart: null, quietHoursEnd: null },
        ]),
      },
      pushLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userNotification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const oneSignal: any = { send: jest.fn().mockResolvedValue({ id: 'n1' }) };
    return { svc: new NotificationsService(prisma, oneSignal), prisma, oneSignal };
  };

  beforeAll(() => jest.useFakeTimers({ now: new Date('2026-11-01T23:15:00+05:30') }));
  afterAll(() => jest.useRealTimers());

  const opts = { category: 'eventReminders' as const, title: 'Tomorrow', body: 'See you there' };

  it('holds a normal push to the window end, one request per delivery time; inbox written now', async () => {
    const { svc, prisma, oneSignal } = build();
    const summary = await svc.send(['u-quiet', 'u-awake'], opts);

    const calls = oneSignal.send.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toHaveLength(2);
    expect(calls.find((c: any) => c.externalIds[0] === 'u-awake').sendAfter).toBeUndefined();
    expect(calls.find((c: any) => c.externalIds[0] === 'u-quiet').sendAfter).toEqual(
      new Date('2026-11-02T07:00:00+05:30'),
    );
    expect(prisma.userNotification.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(summary.sent).toBe(2);
  });

  it('never holds back urgent (critical) sends or transactional categories', async () => {
    const { svc, oneSignal } = build();
    await svc.send(['u-quiet', 'u-awake'], { ...opts, urgent: true });
    await svc.send(['u-quiet', 'u-awake'], { ...opts, category: 'registrationUpdates' });
    await svc.send(['u-quiet', 'u-awake'], { ...opts, category: 'support' });
    await svc.send(['u-quiet', 'u-awake'], { ...opts, category: 'organiserAnnouncements' });
    for (const [params] of oneSignal.send.mock.calls) {
      expect(params.externalIds).toEqual(['u-quiet', 'u-awake']);
      expect(params.sendAfter).toBeUndefined();
    }
    expect(oneSignal.send).toHaveBeenCalledTimes(4);
  });
});
