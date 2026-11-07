import { CampaignsService, resolveAudience } from './campaigns.service';

describe('CampaignsService (C17)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    scope: 'PLATFORM',
    spaceId: null,
    eventId: null,
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

  const build = (campaign = row(), users = ['u1', 'u2'], paused = false, cleared = true) => {
    const prisma: any = {
      campaign: {
        create: jest.fn(async ({ data }: any) => ({ ...campaign, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(campaign),
        findFirst: jest.fn().mockResolvedValue(campaign),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(campaign),
        count: jest.fn().mockResolvedValue(0),
      },
      event: { findFirst: jest.fn(async ({ where }: any) => (where.spaceId === 's1' && where.id === 'e1' ? { id: 'e1' } : null)) },
      user: { findMany: jest.fn().mockResolvedValue(users.map((id) => ({ id }))) },
      messageDelivery: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const check: any = { clear: jest.fn().mockResolvedValue(cleared) };
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
    const platformConfig: any = {
      isCommsPaused: async () => paused,
      assertCommsOpen: async () => {
        if (paused) throw new Error('Sending is paused');
      },
    };
    const svc = new CampaignsService(prisma, notifications, push, email, whatsapp, platformConfig, check);
    return { svc, prisma, notifications, push, email, whatsapp, check };
  };
  const PLATFORM = { scope: 'PLATFORM' as const };
  const SPACE = { scope: 'SPACE' as const, spaceId: 's1' };
  const finished = (prisma: any) => prisma.campaign.update.mock.calls[0][0].data;

  it('hands every channel the same resolved people and links what each made', async () => {
    const { svc, prisma, push, email, whatsapp } = build();
    await svc.dispatch('c1');

    expect(push.createBroadcast).toHaveBeenCalledWith('admin', {
      title: 'Hack Night',
      body: 'Friday, 7 PM',
      category: 'productUpdates',
      target: { type: 'users', userIds: ['u1', 'u2'] },
      eventId: null,
    });
    expect(email.createCampaign).toHaveBeenCalledWith(
      { spaceId: null },
      'admin',
      { targetType: 'SEGMENT', segmentFilters: { userIds: ['u1', 'u2'] }, subject: 'Hack Night', body: '<p>Friday</p>' },
      'c1',
    );
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
    const saved = await svc.create(PLATFORM, 'admin', { channels: ['push'], push: { title: 'a', body: 'b' }, audience: { type: 'all' }, scheduledAt: later });
    expect(saved.status).toBe('SCHEDULED');
    expect(push.createBroadcast).not.toHaveBeenCalled();
    await expect(
      svc.create(PLATFORM, 'admin', { channels: ['push'], push: { title: 'a', body: 'b' }, audience: { type: 'all' }, scheduledAt: '2020-01-01T00:00:00Z' }),
    ).rejects.toThrow('That time has passed.');
  });

  it('while paused, send-now is refused and a due campaign stays scheduled', async () => {
    const { svc, prisma, push } = build(row({ status: 'SCHEDULED' }), ['u1'], true);
    await expect(
      svc.create(PLATFORM, 'admin', { channels: ['push'], push: { title: 'a', body: 'b' }, audience: { type: 'all' } }),
    ).rejects.toThrow('Sending is paused');
    expect(prisma.campaign.create).not.toHaveBeenCalled();
    await svc.dispatch('c1');
    expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
    expect(push.createBroadcast).not.toHaveBeenCalled();
  });

  it('counts each channel after its own opt-outs', async () => {
    const { svc } = build();
    const out = await svc.count(PLATFORM, {
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
    const got = await svc.get(PLATFORM, 'c1');
    expect(got.counts).toEqual({ push: { SENT: 2, SKIPPED: 1 }, email: { DELIVERED: 1 } });
    expect(prisma.messageDelivery.groupBy.mock.calls[0][0].where).toEqual({ campaignId: { in: ['p1', 'e1'] } });
  });

  describe('organiser campaigns (part 3)', () => {
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const msg = { channels: ['push' as const], push: { title: 'Doors at 6', body: 'Bring your ticket.' }, scheduledAt: later };

    it('a space reaches its own members, as space news, never the platform audience', async () => {
      const { svc, prisma } = build();
      const saved = await svc.create(SPACE, 'org', { ...msg, audience: { type: 'space', spaceId: 'other-space' } });
      expect(prisma.campaign.create.mock.calls[0][0].data).toMatchObject({
        scope: 'SPACE',
        spaceId: 's1',
        eventId: null,
        category: 'spaceUpdates',
        audience: { type: 'space', spaceId: 's1' },
      });
      expect(saved.status).toBe('SCHEDULED');
      await expect(svc.create(SPACE, 'org', { ...msg, audience: { type: 'all' } })).rejects.toThrow('A space sends to');
    });

    it("a space's event audience is an announcement, only for its own events", async () => {
      const { svc, prisma } = build();
      await svc.create(SPACE, 'org', { ...msg, audience: { type: 'event', eventId: 'e1' } });
      expect(prisma.campaign.create.mock.calls[0][0].data).toMatchObject({ eventId: 'e1', category: 'organiserAnnouncements' });
      await expect(svc.create(SPACE, 'org', { ...msg, audience: { type: 'event', eventId: 'e9' } })).rejects.toThrow(
        'That event is not in this space.',
      );
    });

    it('organisers get no WhatsApp, and at most 3 a day per event', async () => {
      const { svc, prisma } = build();
      await expect(
        svc.create(SPACE, 'org', { ...msg, channels: ['whatsapp'], whatsapp: { templateName: 'x' }, audience: { type: 'space' } }),
      ).rejects.toThrow('WhatsApp campaigns are sent by Unifesto only.');
      prisma.campaign.count.mockResolvedValue(3);
      await expect(svc.create(SPACE, 'org', { ...msg, audience: { type: 'event', eventId: 'e1' } })).rejects.toThrow(
        'Up to 3 campaigns a day for this event',
      );
      expect(prisma.campaign.count.mock.calls.at(-1)[0].where).toMatchObject({ eventId: 'e1', status: { not: 'CANCELLED' } });
    });

    it('AI19 reads every channel once; a held campaign hands nothing off until staff release it', async () => {
      const organiser = row({ scope: 'SPACE', spaceId: 's1', eventId: 'e1', createdById: 'org', channels: ['push', 'email'], category: 'organiserAnnouncements' });
      const { svc, prisma, push, email, check } = build(organiser, ['u1'], false, false);
      await svc.dispatch('c1');
      expect(check.clear).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'CAMPAIGN', refId: 'c1', spaceId: 's1', eventId: 'e1', senderId: 'org' }),
      );
      expect(check.clear.mock.calls[0][0].text).toContain('Friday, 7 PM');
      expect(check.clear.mock.calls[0][0].text).toContain('Hack Night');
      expect(prisma.campaign.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'HELD' } });
      expect(push.createBroadcast).not.toHaveBeenCalled();
      expect(email.createCampaign).not.toHaveBeenCalled();

      // Released: back to DRAFT and sent (the check now answers from the released hold).
      check.clear.mockResolvedValue(true);
      await svc.onBroadcastDecided({ kind: 'CAMPAIGN', refId: 'c1', release: true, payload: null });
      expect(prisma.campaign.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', status: 'HELD' }, data: { status: 'DRAFT' } });
      expect(push.createBroadcast).toHaveBeenCalledWith('org', expect.objectContaining({ category: 'organiserAnnouncements', eventId: 'e1' }));
      expect(email.createCampaign.mock.calls[0][0]).toEqual({ spaceId: 's1' });
      expect(email.createCampaign.mock.calls[0][3]).toBe('c1');
    });

    it('Apex campaigns are never checked', async () => {
      const { svc, check, push } = build();
      await svc.dispatch('c1');
      expect(check.clear).not.toHaveBeenCalled();
      expect(push.createBroadcast).toHaveBeenCalled();
    });
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

  it("a space's picked people must be its members", async () => {
    const prisma = prismaWith();
    await resolveAudience(prisma as any, { type: 'users', userIds: ['u1', 'u9'] }, 's1');
    expect(where(prisma).AND[0]).toEqual({ id: { in: ['u1', 'u9'] }, roles: { some: { spaceId: 's1' } } });
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
