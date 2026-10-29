import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  RoleCode,
  RoleScope,
  SupportDesk,
  SupportMessageSide,
  SupportTicketCategory,
  SupportTicketStatus,
} from '@prisma/client';
import { AuthorizationService, CapabilityConfigService } from '../auth/authorization';
import { SupportService, isUnread } from './support.service';

/** D1: Assist case fields are set on create and reply; legacy isStaffReply still written. */

type Role = { code: RoleCode; scope: RoleScope; spaceId?: string | null; eventId?: string | null };
const ADMIN: Role = { code: RoleCode.ADMIN, scope: RoleScope.PLATFORM };

/** Real AuthorizationService over faked Prisma, so the compiled capability defaults are exercised. */
function setup({ admin = false, roles = [] as Role[], ticket = {} as any, reg = null as any, message = null as any, attachment = null as any } = {}) {
  const assignments = admin ? [ADMIN, ...roles] : roles;
  const prisma: any = {
    userCapabilityOverride: { findMany: jest.fn(async () => []) },
    userRole: {
      findMany: jest.fn(async () =>
        assignments.map((r) => ({
          role: { code: r.code, scope: r.scope },
          spaceId: r.spaceId ?? null,
          eventId: r.eventId ?? null,
        })),
      ),
    },
    space: { findUnique: jest.fn(async () => ({ id: 'sp-1' })) },
    event: { findUnique: jest.fn(async () => ({ id: 'ev-1', spaceId: 'sp-1' })) },
    eventRegistration: { findUnique: jest.fn(async () => reg) },
    supportTicket: {
      create: jest.fn(async (args: any) => args.data),
      findFirst: jest.fn(async () => null),
      findUniqueOrThrow: jest.fn(async (args: any) => ({ id: args.where.id })),
      findUnique: jest.fn(async () => ({
        id: 't-1',
        requesterId: 'user-1',
        status: SupportTicketStatus.OPEN,
        firstResponseAt: null,
        desk: SupportDesk.PLATFORM,
        eventId: null,
        escalatedAt: null,
        kind: 'HELP',
        priority: 'NORMAL',
        createdAt: new Date(),
        messages: [],
        ...ticket,
      })),
      update: jest.fn(async (args: any) => args),
      updateMany: jest.fn(async () => ({ count: 2 })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      fields: { deskLastReadAt: 'deskLastReadAt', requesterLastReadAt: 'requesterLastReadAt' },
    },
    refundRequest: { findMany: jest.fn(async () => []) },
    spaceRequest: { findUnique: jest.fn(async () => ({ id: 'sr-1', status: 'PENDING' })) },
    supportMessage: {
      create: jest.fn(async (args: any) => args.data),
      findUnique: jest.fn(async () => message),
    },
    supportAttachment: {
      create: jest.fn(async (args: any) => args.data),
      findUnique: jest.fn(async () => attachment),
    },
    cannedReply: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => ({ spaceId: 'sp-1' })),
      create: jest.fn(async (args: any) => args.data),
      update: jest.fn(async (args: any) => args.data),
      delete: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const authz = new AuthorizationService(prisma, new CapabilityConfigService(prisma));
  const storage: any = {
    uploadPrivate: jest.fn(async () => undefined),
    signedGetUrl: jest.fn(async (key: string) => `signed:${key}`),
  };
  const events: any = { emit: jest.fn() };
  return { prisma, storage, events, service: new SupportService(prisma, authz, storage, events) };
}

describe('SupportService (Assist case)', () => {
  it('D14: a bot chat is quiet until handoff, then reaches the desk once', async () => {
    const { prisma, events, service } = setup();
    const data: any = await service.createTicket({ subject: 's', message: 'm' } as any, 'user-1', { bot: true });
    expect(data.status).toBe(SupportTicketStatus.BOT);
    expect(events.emit).not.toHaveBeenCalled();

    prisma.supportTicket.updateMany = jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.supportMessage.createMany = jest.fn();
    await service.handoff('t-1', 'user-1', 'wants a person');
    await service.handoff('t-1', 'user-1', 'again');
    expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-1', requesterId: 'user-1', status: SupportTicketStatus.BOT } }),
    );
    expect(prisma.supportMessage.createMany).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('support.case', expect.objectContaining({ kind: 'CREATED', to: 'DESK' }));

    // Requesters see their bot chats; desks don't, unless they ask for BOT.
    await service.listTickets('user-1', {});
    expect(prisma.supportTicket.findMany.mock.calls.at(-1)[0].where.status).toBeUndefined();
    const desk = setup({ admin: true });
    await desk.service.listTickets('admin-1', {});
    expect(desk.prisma.supportTicket.findMany.mock.calls.at(-1)[0].where.status).toEqual({ not: SupportTicketStatus.BOT });
  });

  it('creates a HELP case on the requester side with event context from the registration', async () => {
    const { prisma, service } = setup({ reg: { userId: 'user-1', eventId: 'ev-1' } });
    const data: any = await service.createTicket(
      { subject: 's', message: 'm', registrationId: 'reg-1' } as any,
      'user-1',
    );
    expect(data).toMatchObject({ kind: 'HELP', eventId: 'ev-1', registrationId: 'reg-1' });
    expect(data.requesterLastReadAt).toBeInstanceOf(Date);
    expect(data.messages.create).toMatchObject({ side: 'REQUESTER', isStaffReply: false });
    expect(prisma.event.findUnique.mock.calls[0][0].where).toEqual({ id: 'ev-1' });
  });

  it('D29: a repeat of an open case joins it instead of opening a copy', async () => {
    const { prisma, events, service } = setup();
    prisma.supportTicket.findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 't-1', messages: [{ body: 'm' }] })
      .mockResolvedValueOnce({ id: 't-1', messages: [{ body: 'm' }] });
    const same: any = await service.createTicket({ subject: 's', message: 'm' } as any, 'user-1');
    expect(same.id).toBe('t-1');
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
    const more: any = await service.createTicket({ subject: 's', message: 'still waiting' } as any, 'user-1');
    expect(more.id).toBe('t-1');
    expect(prisma.supportMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(prisma.supportTicket.findFirst.mock.calls[0][0].where).toMatchObject({
      requesterId: 'user-1',
      subject: 's',
      kind: 'HELP',
      status: { in: [SupportTicketStatus.OPEN, SupportTicketStatus.PENDING] },
    });
    expect(events.emit).toHaveBeenCalledTimes(1); // the appended reply, not a new case
  });

  it("rejects someone else's registration", async () => {
    const { service } = setup({ reg: { userId: 'other', eventId: 'ev-1' } });
    await expect(
      service.createTicket({ subject: 's', message: 'm', registrationId: 'reg-1' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desk reply sets side DESK, firstResponseAt once, and desk read state', async () => {
    const { prisma, service } = setup({ admin: true });
    await service.addMessage('t-1', { body: 'hi' }, 'admin-1');
    expect(prisma.supportMessage.create.mock.calls[0][0].data).toMatchObject({
      side: SupportMessageSide.DESK,
      isStaffReply: true,
    });
    const data = prisma.supportTicket.update.mock.calls[0][0].data;
    expect(data.status).toBe(SupportTicketStatus.PENDING);
    expect(data.firstResponseAt).toBeInstanceOf(Date);
    expect(data.deskLastReadAt).toBeInstanceOf(Date);
  });

  it('keeps an existing firstResponseAt', async () => {
    const { prisma, service } = setup({ admin: true, ticket: { firstResponseAt: new Date(0) } });
    await service.addMessage('t-1', { body: 'again' }, 'admin-1');
    expect(prisma.supportTicket.update.mock.calls[0][0].data).not.toHaveProperty('firstResponseAt');
  });

  it('requester reply reopens, but a BOT chat stays with the bot', async () => {
    const open = setup();
    await open.service.addMessage('t-1', { body: 'x' }, 'user-1');
    const d = open.prisma.supportTicket.update.mock.calls[0][0].data;
    expect(d.status).toBe(SupportTicketStatus.OPEN);
    expect(d.requesterLastReadAt).toBeInstanceOf(Date);
    expect(open.prisma.supportMessage.create.mock.calls[0][0].data.side).toBe('REQUESTER');

    const bot = setup({ ticket: { status: SupportTicketStatus.BOT } });
    await bot.service.addMessage('t-1', { body: 'x' }, 'user-1');
    expect(bot.prisma.supportTicket.update.mock.calls[0][0].data.status).toBe(SupportTicketStatus.BOT);
  });

  it('never returns author or assignee contact details in the thread', async () => {
    const { prisma, service } = setup();
    await service.getTicket('t-1', 'user-1');
    const inc = prisma.supportTicket.findUnique.mock.calls[0][0].include;
    for (const sel of [inc.assignedTo.select, inc.messages.include.author.select]) {
      expect(sel).not.toHaveProperty('mobileNumber');
      expect(sel).not.toHaveProperty('identities');
    }
  });

  it('hides internal notes from the requester', async () => {
    const messages = [{ id: 'a', internal: false }, { id: 'b', internal: true }];
    const { service } = setup({ ticket: { messages } });
    const t: any = await service.getTicket('t-1', 'user-1');
    expect(t.messages.map((m: any) => m.id)).toEqual(['a']);
  });
});

/** D2: access, routing and escalation. */
describe('SupportService (Assist access, routing, escalation)', () => {
  const spaceCase = {
    requesterId: 'user-1',
    desk: SupportDesk.SPACE,
    eventId: 'ev-1' as string | null,
    spaceId: 'sp-1' as string | null,
    escalatedAt: null as Date | null,
  };
  const curator: Role = { code: RoleCode.CURATOR, scope: RoleScope.EVENT, eventId: 'ev-1' };
  const coCurator: Role = { code: RoleCode.CO_CURATOR, scope: RoleScope.EVENT, eventId: 'ev-1' };
  const crew: Role = { code: RoleCode.CREW, scope: RoleScope.EVENT, eventId: 'ev-1' };
  const spaceAdmin: Role = { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-1' };
  const otherSpaceAdmin: Role = { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-2' };

  describe('canSeeCase', () => {
    it('lets the requester and platform admins see any case', async () => {
      expect(await setup().service.canSeeCase('user-1', spaceCase)).toBe(true);
      expect(await setup({ admin: true }).service.canSeeCase('staff', { ...spaceCase, eventId: null })).toBe(true);
    });

    it('lets space support (Space Admin, Curator, Co-Curator) see the event case, not Crew', async () => {
      for (const r of [spaceAdmin, curator, coCurator]) {
        expect(await setup({ roles: [r] }).service.canSeeCase('staff', spaceCase)).toBe(true);
      }
      expect(await setup({ roles: [crew] }).service.canSeeCase('staff', spaceCase)).toBe(false);
    });

    it('denies another space and strangers; space keeps read after escalation', async () => {
      expect(await setup({ roles: [otherSpaceAdmin] }).service.canSeeCase('staff', spaceCase)).toBe(false);
      expect(await setup().service.canSeeCase('stranger', spaceCase)).toBe(false);
      const escalated = { ...spaceCase, desk: SupportDesk.PLATFORM, escalatedAt: new Date() };
      expect(await setup({ roles: [curator] }).service.canSeeCase('staff', escalated)).toBe(true);
    });

    it('keeps a case routed straight to Platform away from the space, even with an eventId', async () => {
      const platformCase = { ...spaceCase, desk: SupportDesk.PLATFORM };
      for (const r of [spaceAdmin, curator]) {
        expect(await setup({ roles: [r] }).service.canSeeCase('staff', platformCase)).toBe(false);
      }
    });

    it('a space-level case (no event) is for the Space Admins, not event crew', async () => {
      const noEvent = { ...spaceCase, eventId: null };
      expect(await setup({ roles: [spaceAdmin] }).service.canSeeCase('staff', noEvent)).toBe(true);
      for (const r of [curator, otherSpaceAdmin]) {
        expect(await setup({ roles: [r] }).service.canSeeCase('staff', noEvent)).toBe(false);
      }
    });

    it("the space desk gets the requester's email but not their phone", async () => {
      const requester = { id: 'user-1', mobileNumber: '+910000000000', identities: [{ email: 'a@b.c' }] };
      const ticket = { desk: SupportDesk.SPACE, eventId: 'ev-1', spaceId: 'sp-1', requester };
      const desk: any = await setup({ roles: [curator], ticket }).service.getTicket('t-1', 'staff');
      expect(desk.requester).not.toHaveProperty('mobileNumber');
      expect(desk.requester.identities).toEqual([{ email: 'a@b.c' }]);
      const platform: any = await setup({ admin: true, ticket }).service.getTicket('t-1', 'staff');
      expect(platform.requester.mobileNumber).toBe('+910000000000');
    });

    it('getTicket forbids a stranger', async () => {
      await expect(setup().service.getTicket('t-1', 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('routing on create', () => {
    const create = async (dto: any, reg: any = null) => {
      const { service } = setup({ reg });
      return (await service.createTicket({ subject: 's', message: 'm', ...dto }, 'user-1')) as any;
    };

    it('sends an event question to the space desk of the event', async () => {
      expect(await create({ eventId: 'ev-1' })).toMatchObject({ desk: 'SPACE', spaceId: 'sp-1' });
      expect(
        await create({ registrationId: 'reg-1' }, { userId: 'user-1', eventId: 'ev-1' }),
      ).toMatchObject({ desk: 'SPACE', spaceId: 'sp-1', eventId: 'ev-1' });
    });

    it('sends account/payment/app issues, other kinds and no-context cases to Platform', async () => {
      for (const category of [SupportTicketCategory.ACCOUNT, SupportTicketCategory.PAYMENTS, SupportTicketCategory.TECHNICAL]) {
        expect((await create({ eventId: 'ev-1', category })).desk).toBe('PLATFORM');
      }
      expect((await create({ eventId: 'ev-1', kind: 'REPORT' })).desk).toBe('PLATFORM');
      expect((await create({})).desk).toBe('PLATFORM');
    });

    it("sends a space question to that space's desk, but an operator's own space case to Platform", async () => {
      expect(await create({ spaceId: 'sp-1' })).toMatchObject({ desk: 'SPACE', spaceId: 'sp-1', eventId: null });
      const { service } = setup({ roles: [spaceAdmin] });
      const own: any = await service.createTicket({ subject: 's', message: 'm', spaceId: 'sp-1' } as any, 'user-1');
      expect(own).toMatchObject({ desk: 'PLATFORM', spaceId: 'sp-1' });
    });
  });

  describe('replies by desk', () => {
    it('space support replies as the desk on a space case', async () => {
      const { prisma, service } = setup({ roles: [curator], ticket: spaceCase });
      await service.addMessage('t-1', { body: 'hi' }, 'staff');
      expect(prisma.supportMessage.create.mock.calls[0][0].data.side).toBe(SupportMessageSide.DESK);
    });

    it('space support cannot reply once escalated (read only)', async () => {
      const { service } = setup({ roles: [curator], ticket: { ...spaceCase, desk: SupportDesk.PLATFORM } });
      await expect(service.addMessage('t-1', { body: 'hi' }, 'staff')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('escalate', () => {
    it('requester or space desk moves the case to Platform', async () => {
      for (const [roles, by] of [[[], 'user-1'], [[spaceAdmin], 'staff']] as const) {
        const { prisma, service } = setup({ roles: [...roles], ticket: spaceCase });
        await service.escalate('t-1', by);
        const data = prisma.supportTicket.update.mock.calls[0][0].data;
        expect(data).toMatchObject({ desk: SupportDesk.PLATFORM, status: SupportTicketStatus.OPEN });
        expect(data.escalatedAt).toBeInstanceOf(Date);
      }
    });

    it('rejects Crew and strangers, and a case already with Platform', async () => {
      await expect(setup({ roles: [crew], ticket: spaceCase }).service.escalate('t-1', 'staff')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(setup({ ticket: spaceCase }).service.escalate('t-1', 'stranger')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(setup().service.escalate('t-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('send to space', () => {
    const fest = { title: 'Fest 2026', spaceId: 'sp-1', deletedAt: null };

    it('Platform moves a no-event case to the event organiser, says so, and tells the space desk', async () => {
      const { prisma, events, service } = setup({ admin: true, ticket: { kind: 'HELP', assignedToId: 'admin-1' } });
      prisma.event.findUnique.mockResolvedValueOnce(fest);
      await service.sendToSpace('t-1', 'ev-1', 'admin-1');
      expect(prisma.supportTicket.update.mock.calls[0][0].data).toMatchObject({
        desk: SupportDesk.SPACE,
        eventId: 'ev-1',
        spaceId: 'sp-1',
        escalatedAt: null,
        assignedToId: null,
        deskLastReadAt: null,
        status: SupportTicketStatus.OPEN,
      });
      expect(prisma.supportMessage.create.mock.calls[0][0].data).toMatchObject({
        side: SupportMessageSide.SYSTEM,
        body: 'Unifesto passed this to the organiser of Fest 2026',
      });
      expect(events.emit.mock.calls.map((c: any[]) => c[1])).toEqual([
        { ticketId: 't-1', kind: 'SENT_TO_SPACE', to: 'DESK', actorId: 'admin-1' },
        { ticketId: 't-1', kind: 'SENT_TO_SPACE', to: 'REQUESTER', actorId: 'admin-1' },
      ]);
    });

    it('the space desk can then see and work it', async () => {
      const moved = { ...spaceCase, eventId: 'ev-1', desk: SupportDesk.SPACE, escalatedAt: null };
      expect(await setup({ roles: [curator] }).service.canSeeCase('staff', moved)).toBe(true);
    });

    it('only Platform may, and only for open help questions on a live event', async () => {
      for (const roles of [[spaceAdmin], [curator], []]) {
        const { prisma, service } = setup({ roles, ticket: { kind: 'HELP' } });
        await expect(service.sendToSpace('t-1', 'ev-1', 'staff')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.supportTicket.update).not.toHaveBeenCalled();
      }
      await expect(
        setup({ admin: true, ticket: { kind: 'REFUND' } }).service.sendToSpace('t-1', 'ev-1', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        setup({ admin: true, ticket: { kind: 'HELP', status: SupportTicketStatus.CLOSED } }).service.sendToSpace('t-1', 'ev-1', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      for (const ev of [null, { ...fest, deletedAt: new Date() }]) {
        const { prisma, events, service } = setup({ admin: true, ticket: { kind: 'HELP' } });
        prisma.event.findUnique.mockResolvedValueOnce(ev);
        await expect(service.sendToSpace('t-1', 'ev-1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
        expect(events.emit).not.toHaveBeenCalled();
      }
    });
  });

  describe('attachments (D4)', () => {
    const PNG = Buffer.from('\x89PNG\r\n\x1a\nrest', 'latin1');
    const file = (buffer: Buffer, size = buffer.length) => ({ buffer, size, originalname: 'shot.png' }) as any;
    const msg = (over: any = {}) => ({
      ticketId: 't-1',
      authorId: 'user-1',
      ticket: { status: SupportTicketStatus.OPEN, requesterId: 'user-1', desk: SupportDesk.SPACE, eventId: 'ev-1', escalatedAt: null },
      _count: { attachments: 0 },
      ...over,
    });
    const att = (over: any = {}, ticket: any = {}) => ({
      key: 'private/support/t-1/m-1/x.png',
      name: 'shot.png',
      message: {
        internal: false,
        ticket: { requesterId: 'user-1', desk: SupportDesk.SPACE, eventId: 'ev-1', escalatedAt: null, ...ticket },
      },
      ...over,
    });

    it('stores a sniffed image under private/ for the message author', async () => {
      const { prisma, storage, service } = setup({ message: msg() });
      await service.addAttachment('t-1', 'm-1', 'user-1', file(PNG));
      const key = storage.uploadPrivate.mock.calls[0][1] as string;
      expect(key).toMatch(/^private\/support\/t-1\/m-1\/.+\.png$/);
      expect(prisma.supportAttachment.create.mock.calls[0][0].data).toMatchObject({
        messageId: 'm-1',
        key,
        mime: 'image/png',
        name: 'shot.png',
      });
    });

    it('rejects other authors, wrong types, oversize files and closed cases', async () => {
      await expect(setup({ message: msg() }).service.addAttachment('t-1', 'm-1', 'other', file(PNG))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(setup({ message: msg() }).service.addAttachment('t-1', 'm-1', 'user-1', file(Buffer.from('MZ-exe')))).rejects.toBeInstanceOf(BadRequestException);
      await expect(setup({ message: msg() }).service.addAttachment('t-1', 'm-1', 'user-1', file(PNG, 11 * 1024 * 1024))).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        setup({ message: msg({ ticket: { ...msg().ticket, status: SupportTicketStatus.CLOSED } }) }).service.addAttachment('t-1', 'm-1', 'user-1', file(PNG)),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(setup({ message: msg() }).service.addAttachment('t-2', 'm-1', 'user-1', file(PNG))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lets space crew attach only while the case is on their desk', async () => {
      const mine = msg({ authorId: 'cur-1' });
      await expect(setup({ message: mine, roles: [curator] }).service.addAttachment('t-1', 'm-1', 'cur-1', file(PNG))).resolves.toBeDefined();
      const escalated = msg({ authorId: 'cur-1', ticket: { ...mine.ticket, desk: SupportDesk.PLATFORM, escalatedAt: new Date() } });
      await expect(setup({ message: escalated, roles: [curator] }).service.addAttachment('t-1', 'm-1', 'cur-1', file(PNG))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(setup({ message: mine }).service.addAttachment('t-1', 'm-1', 'cur-1', file(PNG))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('signs a short-lived link for the requester and the space desk', async () => {
      const { storage, service } = setup({ attachment: att() });
      expect(await service.attachmentUrl('a-1', 'user-1')).toEqual({ url: 'signed:private/support/t-1/m-1/x.png' });
      expect(storage.signedGetUrl.mock.calls[0][1]).toBeLessThanOrEqual(300);

      const curator = setup({ attachment: att(), roles: [{ code: RoleCode.CURATOR, scope: RoleScope.EVENT, eventId: 'ev-1' }] });
      await expect(curator.service.attachmentUrl('a-1', 'cur-1')).resolves.toHaveProperty('url');
    });

    it('hides attachments from outsiders, and internal-note files from the requester', async () => {
      await expect(setup({ attachment: att() }).service.attachmentUrl('a-1', 'stranger')).rejects.toBeInstanceOf(NotFoundException);
      const curatorRole = [{ code: RoleCode.CURATOR, scope: RoleScope.EVENT, eventId: 'ev-1' }];
      await expect(
        setup({ attachment: att({}, { desk: SupportDesk.PLATFORM }), roles: curatorRole }).service.attachmentUrl('a-1', 'cur-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      const internal = att({ message: { ...att().message, internal: true } });
      await expect(setup({ attachment: internal }).service.attachmentUrl('a-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(setup({ attachment: internal, admin: true }).service.attachmentUrl('a-1', 'admin-1')).resolves.toHaveProperty('url');
    });
  });
});

describe('SupportService (D3 notifications + unread)', () => {
  const spaceCase = { requesterId: 'user-1', desk: SupportDesk.SPACE, eventId: 'ev-1', spaceId: 'sp-1', escalatedAt: null };
  const emitted = (events: any) => events.emit.mock.calls.map((c: any[]) => c[1]);

  it('tells the desk about a new case and the other side about each reply', async () => {
    const created = setup();
    await created.service.createTicket({ subject: 's', message: 'm' } as any, 'user-1');
    expect(emitted(created.events)).toEqual([expect.objectContaining({ kind: 'CREATED', to: 'DESK', actorId: 'user-1' })]);

    const byDesk = setup({ admin: true });
    await byDesk.service.addMessage('t-1', { body: 'hi' }, 'admin-1');
    expect(emitted(byDesk.events)).toEqual([{ ticketId: 't-1', kind: 'REPLIED', to: 'REQUESTER', actorId: 'admin-1', message: 'hi' }]);

    const byRequester = setup();
    await byRequester.service.addMessage('t-1', { body: 'yo' }, 'user-1');
    expect(emitted(byRequester.events)[0]).toMatchObject({ to: 'DESK' });

    const bot = setup({ ticket: { status: SupportTicketStatus.BOT } });
    await bot.service.addMessage('t-1', { body: 'q' }, 'user-1');
    expect(bot.events.emit).not.toHaveBeenCalled();
  });

  it('a new case starts read for the requester (same instant as its first message)', async () => {
    const { service } = setup();
    const data: any = await service.createTicket({ subject: 's', message: 'm' } as any, 'user-1');
    expect(data.lastMessageAt).toBe(data.requesterLastReadAt);
  });

  it('tells the requester when the desk resolves or closes, and the desk when the requester reopens', async () => {
    const resolve = setup({ admin: true });
    await resolve.service.updateTicket('t-1', { status: SupportTicketStatus.RESOLVED } as any, 'admin-1');
    expect(emitted(resolve.events)).toEqual([expect.objectContaining({ kind: 'STATUS', to: 'REQUESTER' })]);

    const triage = setup({ admin: true });
    await triage.service.updateTicket('t-1', { priority: 'HIGH' } as any, 'admin-1');
    expect(triage.events.emit).not.toHaveBeenCalled();

    const reopen = setup();
    await reopen.service.setStatusAsOwner('t-1', 'user-1', SupportTicketStatus.OPEN);
    expect(emitted(reopen.events)).toEqual([expect.objectContaining({ kind: 'STATUS', to: 'DESK' })]);
  });

  it('opening a thread marks it read for the viewer side only', async () => {
    const requester = setup();
    await requester.service.getTicket('t-1', 'user-1');
    expect(Object.keys(requester.prisma.supportTicket.update.mock.calls[0][0].data)).toEqual(['requesterLastReadAt']);

    const staff = setup({ admin: true });
    await staff.service.getTicket('t-1', 'admin-1');
    expect(Object.keys(staff.prisma.supportTicket.update.mock.calls[0][0].data)).toEqual(['deskLastReadAt']);

    // A space that only keeps read after escalation doesn't read for the desk.
    const spaceAdmin = { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-1' };
    const after = setup({ roles: [spaceAdmin], ticket: { ...spaceCase, desk: SupportDesk.PLATFORM, escalatedAt: new Date(), requester: { id: 'user-1' } } });
    await after.service.getTicket('t-1', 'staff');
    expect(after.prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('isUnread: nothing read yet, or a message since the last read', () => {
    const t0 = new Date('2026-10-18T10:00:00Z');
    const t1 = new Date('2026-10-18T11:00:00Z');
    expect(isUnread(null, t0)).toBe(true);
    expect(isUnread(t0, t1)).toBe(true);
    expect(isUnread(t1, t1)).toBe(false);
  });

  it('space desk members are role holders who pass the support check (no Crew, no other space)', async () => {
    const holders: Record<string, any[]> = {
      curator: [{ code: RoleCode.CURATOR, scope: RoleScope.EVENT, eventId: 'ev-1' }],
      crew: [{ code: RoleCode.CREW, scope: RoleScope.EVENT, eventId: 'ev-1' }],
      admin: [{ code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-1' }],
    };
    const { prisma, service } = setup();
    prisma.userRole.findMany = jest.fn(async (args: any) =>
      args.distinct
        ? Object.keys(holders).map((userId) => ({ userId }))
        : (holders[args.where.userId] ?? []).map((r) => ({ role: { code: r.code, scope: r.scope }, spaceId: r.spaceId ?? null, eventId: r.eventId ?? null })),
    );
    expect(await service.spaceDeskMemberIds(spaceCase)).toEqual(['curator', 'admin']);
    expect(await service.spaceDeskMemberIds({ ...spaceCase, desk: SupportDesk.PLATFORM })).toEqual([]);
  });
});

describe('SupportService (D8 Apex Assist inbox)', () => {
  const whereOf = (prisma: any) => prisma.supportTicket.findMany.mock.calls[0][0].where;

  it('filters by kind, desk, unassigned and Platform-desk unread for staff', async () => {
    const { prisma, service } = setup({ admin: true });
    await service.listTickets('admin-1', { kind: 'REFUND', desk: SupportDesk.PLATFORM, assignedToId: 'none', unread: true } as any);
    const where = whereOf(prisma);
    expect(where).toMatchObject({ kind: 'REFUND', desk: 'PLATFORM', assignedToId: null });
    expect(where.AND[0]).toMatchObject({ desk: 'PLATFORM', OR: [{ deskLastReadAt: null }, { lastMessageAt: { gt: 'deskLastReadAt' } }] });
  });

  it('staff search covers subject, #number and the requester; requesters only search subjects of their own', async () => {
    const staff = setup({ admin: true });
    await staff.service.listTickets('admin-1', { search: '#1042' });
    const or = whereOf(staff.prisma).AND[0].OR;
    expect(or).toContainEqual({ ticketNumber: 1042 });
    expect(or).toContainEqual({ requester: { identities: { some: { email: { contains: '#1042', mode: 'insensitive' } } } } });

    const requester = setup();
    await requester.service.listTickets('user-1', { search: 'refund', desk: SupportDesk.SPACE, assignedToId: 'x' } as any);
    const where = whereOf(requester.prisma);
    expect(where.requesterId).toBe('user-1');
    expect(where.desk).toBeUndefined();
    expect(where.assignedToId).toBeUndefined();
    expect(where.AND[0].OR).toEqual([{ subject: { contains: 'refund', mode: 'insensitive' } }]);
  });

  it('Platform gets the typed record and refunds raised from the case; the requester does not', async () => {
    const ticket = { subjectType: 'SpaceRequest', subjectId: 'sr-1', requester: { id: 'user-1' } };
    const staff = setup({ admin: true, ticket });
    staff.prisma.refundRequest.findMany.mockResolvedValue([{ id: 'rr-1', status: 'PENDING_ADMIN' }]);
    const got: any = await staff.service.getTicket('t-1', 'admin-1');
    expect(got.subjects).toEqual([
      { type: 'SpaceRequest', data: { id: 'sr-1', status: 'PENDING' } },
      { type: 'RefundRequest', data: { id: 'rr-1', status: 'PENDING_ADMIN' } },
    ]);

    const own: any = await setup({ ticket }).service.getTicket('t-1', 'user-1');
    expect(own.subjects).toBeUndefined();
  });

  it('ignores a subject type it does not know', async () => {
    const { service } = setup();
    expect(await service.caseSubjects({ id: 't-1', subjectType: 'User', subjectId: 'u-1' })).toEqual([]);
  });
});

describe('SupportService (D9 Space Assist inbox)', () => {
  const whereOf = (prisma: any) => prisma.supportTicket.findMany.mock.calls[0][0].where;
  const onDesk = { OR: [{ desk: SupportDesk.SPACE }, { escalatedAt: { not: null } }] };
  const curator: Role = { code: RoleCode.CURATOR, scope: RoleScope.EVENT, eventId: 'ev-1' };
  const crew: Role = { code: RoleCode.CREW, scope: RoleScope.EVENT, eventId: 'ev-1' };
  const spaceAdmin: Role = { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-1' };
  const otherSpaceAdmin: Role = { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-2' };
  const spaceCase = { requesterId: 'user-1', desk: SupportDesk.SPACE, eventId: 'ev-1', spaceId: 'sp-1', escalatedAt: null };

  describe('desk listing scope', () => {
    it('a Space Admin lists every event and space-level case on the desk, not only their own', async () => {
      const { prisma, service } = setup({ roles: [spaceAdmin] });
      await service.listTickets('staff', { deskSpaceId: 'sp-1', spaceId: 'sp-9' });
      const where = whereOf(prisma);
      expect(where.requesterId).toBeUndefined();
      expect(where.spaceId).toBeUndefined();
      expect(where.AND[0]).toEqual({
        AND: [onDesk, { OR: [{ event: { spaceId: 'sp-1' } }, { eventId: null, spaceId: 'sp-1' }] }],
      });
    });

    it('an event support team lists only the events where they pass event:manage-support', async () => {
      const { prisma, service } = setup({ roles: [curator] });
      await service.listTickets('staff', { deskSpaceId: 'sp-1' });
      expect(whereOf(prisma).AND[0]).toEqual({ AND: [onDesk, { eventId: { in: ['ev-1'] } }] });
    });

    it('Crew, another space and strangers get no desk', async () => {
      for (const roles of [[crew], [otherSpaceAdmin], []]) {
        await expect(setup({ roles }).service.listTickets('staff', { deskSpaceId: 'sp-1' })).rejects.toBeInstanceOf(ForbiddenException);
        await expect(setup({ roles }).service.spaceDeskUnread('staff', 'sp-1')).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it('the space desk scope agrees with canSeeCase', async () => {
      const { service } = setup({ roles: [curator] });
      expect(await service.canSeeCase('staff', spaceCase)).toBe(true);
      expect(await service.spaceDeskScope('staff', 'sp-1')).not.toBeNull();
    });

    it('rows are unread only while on the space desk; the requester shows email, not phone', async () => {
      const { prisma, service } = setup({ roles: [spaceAdmin] });
      const t = (over: any) => ({ lastMessageAt: new Date(1), deskLastReadAt: null, requesterLastReadAt: null, ...over });
      prisma.supportTicket.findMany.mockResolvedValue([
        t({ id: 'a', desk: SupportDesk.SPACE }),
        t({ id: 'b', desk: SupportDesk.PLATFORM, escalatedAt: new Date(0) }),
      ]);
      const res = await service.listTickets('staff', { deskSpaceId: 'sp-1', unread: true });
      expect(res.tickets.map((x: any) => x.unread)).toEqual([true, false]);
      const args = prisma.supportTicket.findMany.mock.calls[0][0];
      expect(args.include.requester.select).not.toHaveProperty('mobileNumber');
      expect(args.include.requester.select).toHaveProperty('identities');
      expect(args.where.AND[1]).toMatchObject({ desk: SupportDesk.SPACE });
    });

    it('counts unread open cases on the space desk only', async () => {
      const { prisma, service } = setup({ roles: [spaceAdmin] });
      prisma.supportTicket.count.mockResolvedValue(3);
      expect(await service.spaceDeskUnread('staff', 'sp-1')).toEqual({ unread: 3 });
      expect(prisma.supportTicket.count.mock.calls[0][0].where.AND[1]).toMatchObject({
        desk: SupportDesk.SPACE,
        status: { notIn: [SupportTicketStatus.CLOSED, SupportTicketStatus.BOT] },
      });
    });
  });

  describe('internal notes', () => {
    it('the desk writes a note without touching the case or telling anyone', async () => {
      const { prisma, events, service } = setup({ roles: [curator], ticket: spaceCase });
      await service.addMessage('t-1', { body: 'refund looks fine', internal: true }, 'staff');
      expect(prisma.supportMessage.create.mock.calls[0][0].data).toMatchObject({ internal: true, side: SupportMessageSide.DESK });
      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('the requester, Crew and a space after escalation cannot write notes', async () => {
      await expect(
        setup({ ticket: spaceCase }).service.addMessage('t-1', { body: 'x', internal: true }, 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        setup({ roles: [crew], ticket: spaceCase }).service.addMessage('t-1', { body: 'x', internal: true }, 'staff'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const escalated = { ...spaceCase, desk: SupportDesk.PLATFORM, escalatedAt: new Date() };
      await expect(
        setup({ roles: [curator], ticket: escalated }).service.addMessage('t-1', { body: 'x', internal: true }, 'staff'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('Platform can write a note on any case', async () => {
      const { prisma, service } = setup({ admin: true, ticket: spaceCase });
      await service.addMessage('t-1', { body: 'x', internal: true }, 'admin-1');
      expect(prisma.supportMessage.create.mock.calls[0][0].data.internal).toBe(true);
    });
  });
});

describe('SupportService (D19 canned replies + SLA)', () => {
  const spaceAdmin: Role = { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-1' };
  const otherSpaceAdmin: Role = { code: RoleCode.SPACE_ADMIN, scope: RoleScope.SPACE, spaceId: 'sp-2' };

  it("keeps Unifesto's saved replies to Platform and a space's to its desk", async () => {
    await expect(setup({ roles: [spaceAdmin] }).service.listCannedReplies('staff', null)).rejects.toThrow(ForbiddenException);
    await expect(setup({ admin: true }).service.listCannedReplies('admin-1', null)).resolves.toEqual([]);

    const own = setup({ roles: [spaceAdmin] });
    await own.service.createCannedReply('staff', { spaceId: 'sp-1', title: 'Hi', body: 'Hello' });
    expect(own.prisma.cannedReply.create).toHaveBeenCalledWith({ data: { spaceId: 'sp-1', title: 'Hi', body: 'Hello' } });

    // Editing goes by the reply's own space, not anything the caller sends.
    const other = setup({ roles: [otherSpaceAdmin] });
    await expect(other.service.updateCannedReply('staff', 'cr-1', { title: 'x' })).rejects.toThrow(ForbiddenException);
    await expect(other.service.deleteCannedReply('staff', 'cr-1')).rejects.toThrow(ForbiddenException);
    expect(other.prisma.cannedReply.delete).not.toHaveBeenCalled();
  });

  it('filters overdue cases and gives the desk, not the requester, the due time', async () => {
    const staff = setup({ admin: true });
    await staff.service.listTickets('admin-1', { overdue: true });
    expect(staff.prisma.supportTicket.findMany.mock.calls[0][0].where.AND[0].status).toEqual({
      in: [SupportTicketStatus.OPEN, SupportTicketStatus.PENDING],
    });

    const ticket = { kind: 'HELP', priority: 'NORMAL', createdAt: new Date(Date.now() - 25 * 3600_000), requester: { id: 'user-1' } };
    const got: any = await setup({ admin: true, ticket }).service.getTicket('t-1', 'admin-1');
    expect(got.sla).toMatchObject({ stage: 'RESPOND', overdue: true });
    const own: any = await setup({ ticket }).service.getTicket('t-1', 'user-1');
    expect(own.sla).toBeUndefined();
  });
});

describe('SupportService (D20 auto-close + rating)', () => {
  it('lets only the requester rate, and only once resolved', async () => {
    await expect(setup().service.rate('t-1', 'user-1', { rating: 5 })).rejects.toThrow(BadRequestException);
    await expect(
      setup({ ticket: { status: SupportTicketStatus.RESOLVED } }).service.rate('t-1', 'someone-else', { rating: 5 }),
    ).rejects.toThrow(ForbiddenException);

    const { prisma, service } = setup({ ticket: { status: SupportTicketStatus.CLOSED } });
    await service.rate('t-1', 'user-1', { rating: 4, comment: '  quick fix  ' });
    expect(prisma.supportTicket.update.mock.calls[0][0].data).toEqual({ rating: 4, ratingComment: 'quick fix' });
    await service.rate('t-1', 'user-1', { rating: 2, comment: '   ' });
    expect(prisma.supportTicket.update.mock.calls[1][0].data).toEqual({ rating: 2, ratingComment: null });
  });

  it('closes cases resolved more than 7 days ago', async () => {
    const { prisma, service } = setup();
    const now = new Date('2026-10-20T00:00:00Z');
    const before = new Date('2026-10-13T00:00:00Z');
    expect(await service.autoCloseResolved(now)).toBe(2);
    expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
      where: {
        status: SupportTicketStatus.RESOLVED,
        OR: [{ resolvedAt: { lt: before } }, { resolvedAt: null, updatedAt: { lt: before } }],
      },
      data: { status: SupportTicketStatus.CLOSED, closedAt: now },
    });
  });
});
