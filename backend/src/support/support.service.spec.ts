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
function setup({ admin = false, roles = [] as Role[], ticket = {} as any, reg = null as any } = {}) {
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
    supportMessage: { create: jest.fn(async (args: any) => args.data) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const authz = new AuthorizationService(prisma, new CapabilityConfigService(prisma));
  return { prisma, service: new SupportService(prisma, authz) };
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
});
