import { SupportGuestController, findOrCreateGuest, guestToken } from './support-guest.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupportBot } from './support-bot';

/** D11: a guest only ever reaches their own bot chat, and never renames a real account. */
describe('Assist guest contact (D11)', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  function setup(existing: { userId: string } | null = null) {
    const prisma = {
      userIdentity: { findFirst: jest.fn().mockResolvedValue(existing) },
      user: { create: jest.fn().mockResolvedValue({ id: 'new-user' }), update: jest.fn() },
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({ id, requesterId: 'u1', ticketNumber: 7, status: 'BOT', contactEmail: 'a@b.co', messages: [] }),
      },
    } as unknown as PrismaService;
    const bot = { start: jest.fn().mockResolvedValue(id), say: jest.fn(), handoff: jest.fn() } as unknown as SupportBot;
    return { prisma, bot, ctrl: new SupportGuestController(prisma, bot) };
  }

  it('reuses an existing account by email without renaming it; creates an unverified one otherwise', async () => {
    const found = setup({ userId: 'u1' });
    expect(await findOrCreateGuest(found.prisma, ' A@B.co ', 'Someone Else')).toBe('u1');
    expect(found.prisma.user.update).not.toHaveBeenCalled();
    const fresh = setup();
    expect(await findOrCreateGuest(fresh.prisma, 'new@b.co', 'Asha')).toBe('new-user');
    expect((fresh.prisma.user.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      fullName: 'Asha',
      identities: { create: { email: 'new@b.co', emailVerified: false } },
    });
  });

  it('starts a guest bot chat and hands back a token that works only for that chat', async () => {
    const { ctrl, bot } = setup({ userId: 'u1' });
    const res = await ctrl.start({ email: 'A@B.co', message: 'How do refunds work?' });
    expect(bot.start).toHaveBeenCalledWith('u1', expect.objectContaining({ contactEmail: 'a@b.co' }), { guest: true });
    expect(res).toMatchObject({ id, withBot: true, token: guestToken(id) });

    await ctrl.say(id, { token: res.token, body: 'and the fee?' });
    expect(bot.say).toHaveBeenCalledWith(id, 'u1', 'and the fee?', { guest: true });
    await expect(ctrl.say(id, { token: guestToken('22222222-2222-4222-8222-222222222222'), body: 'x' })).rejects.toThrow('Chat not found');
    await expect(ctrl.read(id, { token: '' })).rejects.toThrow('Chat not found');
  });
});
