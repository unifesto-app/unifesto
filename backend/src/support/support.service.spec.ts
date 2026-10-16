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
import { SupportService } from './support.service';

/** D1: Assist case fields are set on create and reply; legacy isStaffReply still written. */

type Role = { code: RoleCode; scope: RoleScope; spaceId?: string | null; eventId?: string | null };
const ADMIN: Role = { code: RoleCode.ADMIN, scope: RoleScope.PLATFORM };

/** Real AuthorizationService over faked Prisma, so the compiled capability defaults are exercised. */
function setup({ admin = false, roles = [] as Role[], ticket = {} as any, reg = null as any, message = null as any, attachment = null as any } = {}) {
  const assignments = admin ? [ADMIN, ...roles] : roles;
  const prisma: any = {
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
      findUnique: jest.fn(async () => ({
        id: 't-1',
        requesterId: 'user-1',
        status: SupportTicketStatus.OPEN,
        firstResponseAt: null,
        desk: SupportDesk.PLATFORM,
        eventId: null,
        messages: [],
        ...ticket,
      })),
      update: jest.fn(async (args: any) => args),
    },
    supportMessage: {
      create: jest.fn(async (args: any) => args.data),
      findUnique: jest.fn(async () => message),
    },
    supportAttachment: {
      create: jest.fn(async (args: any) => args.data),
      findUnique: jest.fn(async () => attachment),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const authz = new AuthorizationService(prisma, new CapabilityConfigService(prisma));
  const storage: any = {
    uploadPrivate: jest.fn(async () => undefined),
    signedGetUrl: jest.fn(async (key: string) => `signed:${key}`),
  };
  return { prisma, storage, service: new SupportService(prisma, authz, storage) };
}

describe('SupportService (Assist case)', () => {
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

  it('hides internal notes from the requester', async () => {
    const messages = [{ id: 'a', internal: false }, { id: 'b', internal: true }];
    const { service } = setup({ ticket: { messages } });
    const t: any = await service.getTicket('t-1', 'user-1');
    expect(t.messages.map((m: any) => m.id)).toEqual(['a']);
  });
});

/** D2: access, routing and escalation. */
describe('SupportService (Assist access, routing, escalation)', () => {
  const spaceCase = { requesterId: 'user-1', desk: SupportDesk.SPACE, eventId: 'ev-1' };
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
      const escalated = { ...spaceCase, desk: SupportDesk.PLATFORM };
      expect(await setup({ roles: [curator] }).service.canSeeCase('staff', escalated)).toBe(true);
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
      expect(await create({ spaceId: 'sp-9' })).toMatchObject({ desk: 'PLATFORM', spaceId: 'sp-9' });
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

  describe('attachments (D4)', () => {
    const PNG = Buffer.from('\x89PNG\r\n\x1a\nrest', 'latin1');
    const file = (buffer: Buffer, size = buffer.length) => ({ buffer, size, originalname: 'shot.png' }) as any;
    const msg = (over: any = {}) => ({
      ticketId: 't-1',
      authorId: 'user-1',
      ticket: { status: SupportTicketStatus.OPEN },
      _count: { attachments: 0 },
      ...over,
    });
    const att = (over: any = {}, ticket: any = {}) => ({
      key: 'private/support/t-1/m-1/x.png',
      name: 'shot.png',
      message: {
        internal: false,
        ticket: { requesterId: 'user-1', desk: SupportDesk.SPACE, eventId: 'ev-1', ...ticket },
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
        setup({ message: msg({ ticket: { status: SupportTicketStatus.CLOSED } }) }).service.addAttachment('t-1', 'm-1', 'user-1', file(PNG)),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(setup({ message: msg() }).service.addAttachment('t-2', 'm-1', 'user-1', file(PNG))).rejects.toBeInstanceOf(NotFoundException);
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
      const internal = att({ message: { ...att().message, internal: true } });
      await expect(setup({ attachment: internal }).service.attachmentUrl('a-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(setup({ attachment: internal, admin: true }).service.attachmentUrl('a-1', 'admin-1')).resolves.toHaveProperty('url');
    });
  });
});
