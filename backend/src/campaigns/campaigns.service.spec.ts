import { CampaignsService, resolveAudience } from './campaigns.service';

describe('CampaignsService (C17)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    scope: 'PLATFORM',
    createdById: 'admin',
    channels: ['push', 'email', 'whatsapp'],
    category: 'productUpdates',
    audience: { type: 'all' },
    content: {
      push: { title: 'Hack Night', body: 'Friday, 7 PM' },
      email: { subject: 'Hack Night', html: '<p>Friday</p>' },
      whatsapp: { templateName: 'event_news', bodyParams: ['Hack Night'] },
    },
    status: 'DRAFT',
    pushCampaignId: null,
    emailCampaignId: null,
    whatsappBroadcastId: null,
    inAppCount: 0,
    ...over,
  });

  const build = (campaign = row(), users = ['u1', 'u2']) => {
    const prisma: any = {
      campaign: {
        create: jest.fn(async ({ data }: any) => ({ ...campaign, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(campaign),
        findFirst: jest.fn().mockResolvedValue(campaign),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(campaign),
      },
      user: { findMany: jest.fn().mockResolvedValue(users.map((id) => ({ id }))) },
      messageDelivery: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const notifications: any = { send: jest.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: 2 }) };
    const push: any = {
      createBroadcast: jest.fn().mockResolvedValue({ id: 'p1' }),
      countAudience: jest.fn().mockResolvedValue({ recipientCount: 2 }),
    };
    const email: any = {
      createCampaign: jest.fn().mockResolvedValue({ success: true, campaignId: 'e1' }),
      countAudience: jest.fn().mockResolvedValue({ recipientCount: 1 }),
    };
    const whatsapp: any = {
      sendBroadcastTemplate: jest.fn().mockResolvedValue({ broadcastId: 'w1' }),
      resolveBroadcastRecipients: jest.fn().mockResolvedValue([{ userId: 'u1' }]),
    };
    const svc = new CampaignsService(prisma, notifications, push, email, whatsapp);
    return { svc, prisma, notifications, push, email, whatsapp };
  };
  const finished = (prisma: any) => prisma.campaign.update.mock.calls[0][0].data;

  it('hands every channel the same resolved people and links what each made', async () => {
    const { svc, prisma, push, email, whatsapp } = build();
    await svc.dispatch('c1');

    expect(push.createBroadcast).toHaveBeenCalledWith('admin', {
      title: 'Hack Night',
      body: 'Friday, 7 PM',
      category: 'productUpdates',
      target: { type: 'users', userIds: ['u1', 'u2'] },
    });
    expect(email.createCampaign).toHaveBeenCalledWith({ spaceId: null }, 'admin', {
      targetType: 'SEGMENT',
      segmentFilters: { userIds: ['u1', 'u2'] },
      subject: 'Hack Night',
      body: '<p>Friday</p>',
    });
    expect(whatsapp.sendBroadcastTemplate).toHaveBeenCalledWith({
      adminUserId: 'admin',
      audience: 'USER',
      userIds: ['u1', 'u2'],
      templateName: 'event_news',
      bodyParams: ['Hack Night'],
    });
    expect(finished(prisma)).toMatchObject({
      status: 'SENT',
      recipientCount: 2,
      pushCampaignId: 'p1',
      emailCampaignId: 'e1',
      whatsappBroadcastId: 'w1',
      error: null,
    });
  });

  it('one channel failing still sends the rest, and says which', async () => {
    const { svc, prisma, whatsapp } = build();
    whatsapp.sendBroadcastTemplate.mockRejectedValue(new Error('No reachable recipients'));
    await svc.dispatch('c1');
    expect(finished(prisma)).toMatchObject({ status: 'SENT', pushCampaignId: 'p1', error: 'whatsapp: No reachable recipients' });
  });

  it('fails with nobody to send to, and never claims twice', async () => {
    const empty = build(row(), []);
    await empty.svc.dispatch('c1');
    expect(finished(empty.prisma)).toMatchObject({ status: 'FAILED', error: 'Nobody in this audience' });
    expect(empty.push.createBroadcast).not.toHaveBeenCalled();

    const taken = build();
    taken.prisma.campaign.updateMany.mockResolvedValue({ count: 0 });
    await taken.svc.dispatch('c1');
    expect(taken.prisma.campaign.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('in-app only writes the in-app copy, with no push', async () => {
    const { svc, prisma, notifications, push } = build(row({ channels: ['inapp'] }));
    await svc.dispatch('c1');
    expect(push.createBroadcast).not.toHaveBeenCalled();
    expect(notifications.send).toHaveBeenCalledWith(['u1', 'u2'], expect.objectContaining({ inboxOnly: true, title: 'Hack Night' }));
    expect(finished(prisma)).toMatchObject({ status: 'SENT', inAppCount: 2 });
  });

  it("staff goes to each channel's own staff test target", async () => {
    const { svc, push, email, whatsapp } = build(row({ audience: { type: 'staff' } }));
    await svc.dispatch('c1');
    expect(push.createBroadcast.mock.calls[0][1].target).toEqual({ type: 'staff' });
    expect(email.createCampaign.mock.calls[0][2]).toMatchObject({ targetType: 'STAFF' });
    expect(whatsapp.sendBroadcastTemplate.mock.calls[0][0]).toMatchObject({ audience: 'STAFF' });
  });

  it('a scheduled campaign waits for the sweep; a past time is refused', async () => {
    const { svc, push } = build();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const saved = await svc.create('admin', { channels: ['push'], push: { title: 'a', body: 'b' }, audience: { type: 'all' }, scheduledAt: later });
    expect(saved.status).toBe('SCHEDULED');
    expect(push.createBroadcast).not.toHaveBeenCalled();
    await expect(
      svc.create('admin', { channels: ['push'], push: { title: 'a', body: 'b' }, audience: { type: 'all' }, scheduledAt: '2020-01-01T00:00:00Z' }),
    ).rejects.toThrow('That time has passed.');
  });

  it('counts each channel after its own opt-outs', async () => {
    const { svc } = build();
    const out = await svc.count({
      audience: { type: 'all' },
      channels: ['push', 'email', 'whatsapp'],
      whatsapp: { templateName: 'event_news' },
    });
    expect(out).toEqual({ audience: 2, push: 2, email: 1, whatsapp: 1 });
  });

  it("reads each channel's delivery rows back by its campaign id", async () => {
    const { svc, prisma } = build(row({ pushCampaignId: 'p1', emailCampaignId: 'e1' }));
    prisma.messageDelivery.groupBy.mockResolvedValue([
      { campaignId: 'p1', status: 'SENT', _count: { _all: 2 } },
      { campaignId: 'p1', status: 'SKIPPED', _count: { _all: 1 } },
      { campaignId: 'e1', status: 'DELIVERED', _count: { _all: 1 } },
    ]);
    const got = await svc.get('c1');
    expect(got.counts).toEqual({ push: { SENT: 2, SKIPPED: 1 }, email: { DELIVERED: 1 } });
    expect(prisma.messageDelivery.groupBy.mock.calls[0][0].where).toEqual({ campaignId: { in: ['p1', 'e1'] } });
  });
});

describe('resolveAudience (C17)', () => {
  const prismaWith = () => ({ user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) } });
  const where = (prisma: any) => prisma.user.findMany.mock.calls[0][0].where;

  it('only ever returns open accounts', async () => {
    const prisma = prismaWith();
    await resolveAudience(prisma as any, { type: 'space', spaceId: 's1' });
    expect(where(prisma)).toEqual({
      AND: [{ roles: { some: { spaceId: 's1' } } }, { deletedAt: null, deletionRequestedAt: null }],
    });
  });

  it('waitlist is people still waiting or offered a seat', async () => {
    const prisma = prismaWith();
    await resolveAudience(prisma as any, { type: 'waitlist', eventId: 'e1' });
    expect(where(prisma).AND[0]).toEqual({
      registrations: {
        some: { eventId: 'e1', waitlistStatus: { in: ['WAITING', 'OFFERED'] }, status: { not: 'CANCELLED' } },
      },
    });
  });
});
