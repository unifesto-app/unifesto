import { NotFoundException } from '@nestjs/common';
import { SupportMessageSide, SupportTicketStatus } from '@prisma/client';
import { SupportService } from './support.service';

/** D1: Assist case fields are set on create and reply; legacy isStaffReply still written. */

function setup({ admin = false, ticket = {} as any, reg = null as any } = {}) {
  const prisma: any = {
    userRole: { count: jest.fn(async () => (admin ? 1 : 0)) },
    space: { findUnique: jest.fn(async () => ({ id: 'sp-1' })) },
    event: { findUnique: jest.fn(async () => ({ id: 'ev-9' })) },
    eventRegistration: { findUnique: jest.fn(async () => reg) },
    supportTicket: {
      create: jest.fn(async (args: any) => args.data),
      findUnique: jest.fn(async () => ({
        id: 't-1',
        requesterId: 'user-1',
        status: SupportTicketStatus.OPEN,
        firstResponseAt: null,
        ...ticket,
      })),
      update: jest.fn(async (args: any) => args),
    },
    supportMessage: { create: jest.fn(async (args: any) => args.data) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  return { prisma, service: new SupportService(prisma) };
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
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
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
    const { prisma, service } = setup();
    await service.getTicket('t-1', 'user-1');
    expect(prisma.supportTicket.findUnique.mock.calls[0][0].include.messages.where).toEqual({ internal: false });
  });
});
