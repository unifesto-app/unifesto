import { Logger } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

/** C8: blast consent, STOP handling, number safety and `{name}` fill. */
describe('WhatsAppService marketing consent', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  const config = {
    get: (k: string) =>
      ({ WHATSAPP_PHONE_NUMBER_ID: 'pn', WHATSAPP_ACCESS_TOKEN: 'tok' })[k as 'WHATSAPP_PHONE_NUMBER_ID'],
  };
  const build = (prisma: any = {}) =>
    new WhatsAppService(config as any, prisma, {} as any, { emit: jest.fn() } as any, {} as any);

  const user = (id: string, mobileNumber: string) => ({ id, fullName: id, username: null, mobileNumber });

  describe('formatPhoneNumber', () => {
    const fmt = (n: string) => (build() as any).formatPhoneNumber(n);
    it('never turns a deleted account placeholder into a number', () => {
      expect(fmt('deleted-9876543210ab')).toBe('');
      expect(fmt('deleted-123456789012')).toBe('');
      expect(fmt('+0123456789')).toBe('');
    });
    it('still formats real numbers', () => {
      expect(fmt('+91 98765 43210')).toBe('+919876543210');
      expect(fmt('9876543210')).toBe('+919876543210');
    });
  });

  it('fills {name} inside a parameter, any case', () => {
    expect(
      (build() as any).personalizeParams(['Hi {name}!', '{NAME}', 'Sprint'], { name: 'Asha' }),
    ).toEqual(['Hi Asha!', 'Asha', 'Sprint']);
    expect((build() as any).personalizeParams(['Hi {name}'], { name: '' })).toEqual(['Hi there']);
  });

  describe('resolveBroadcastRecipients', () => {
    const prismaWith = (optOuts: any[] = []) => ({
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([user('a', '+919876543210'), user('b', '+919876543211'), user('c', '+919876543212')]),
      },
      marketingOptOut: { findMany: jest.fn().mockResolvedValue(optOuts) },
    });

    it('marketing: only opted-in, open accounts, minus anyone who sent STOP', async () => {
      const prisma = prismaWith([{ address: '+919876543211', userId: null }, { address: '+1', userId: 'c' }]);
      const out = await build(prisma).resolveBroadcastRecipients({ audience: 'ALL', category: 'MARKETING' });
      expect(out.map((r) => r.userId)).toEqual(['a']);
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        mobileNumber: { not: '' },
        deletedAt: null,
        deletionRequestedAt: null,
        notificationSettings: { promotions: true },
      });
    });

    it('utility templates skip the promotions opt-in but not the deleted filter', async () => {
      const prisma = prismaWith();
      await build(prisma).resolveBroadcastRecipients({ audience: 'ALL', category: 'UTILITY' });
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        mobileNumber: { not: '' },
        deletedAt: null,
        deletionRequestedAt: null,
      });
    });

    it('an unknown template counts as marketing', async () => {
      const prisma = prismaWith();
      const svc = build(prisma);
      jest.spyOn(svc, 'listMessageTemplates').mockRejectedValue(new Error('no waba'));
      await svc.resolveBroadcastRecipients({ audience: 'ALL', templateName: 'promo' });
      expect(prisma.user.findMany.mock.calls[0][0].where.notificationSettings).toEqual({ promotions: true });
    });

    it("a send-to-me test ignores the admin's own prefs", async () => {
      const prisma = prismaWith([{ address: '+919876543210', userId: 'a' }]);
      const out = await build(prisma).resolveBroadcastRecipients({
        audience: 'USER',
        userIds: ['a'],
        category: 'MARKETING',
        test: true,
      });
      expect(out).toHaveLength(3);
      expect(prisma.marketingOptOut.findMany).not.toHaveBeenCalled();
    });
  });

  describe('inbound STOP', () => {
    const prismaFor = () => {
      const prisma: any = {
        whatsappMessage: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        whatsappConversation: {
          upsert: jest.fn().mockResolvedValue({ id: 'conv', profileName: null }),
        },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
        marketingOptOut: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      };
      prisma.$transaction = (fn: any) => fn(prisma);
      return prisma;
    };
    const inbound = (text: string, id = 'wamid.1') => ({
      entry: [
        {
          changes: [
            { value: { messages: [{ from: '919876543210', id, type: 'text', text: { body: text } }] } },
          ],
        },
      ],
    });

    it('records a WhatsApp marketing opt-out for the sender', async () => {
      const prisma = prismaFor();
      await build(prisma).handleWebhookPayload(inbound(' Stop '));
      expect(prisma.marketingOptOut.create).toHaveBeenCalledWith({
        data: {
          channel: 'WHATSAPP',
          address: '+919876543210',
          spaceId: null,
          userId: 'u1',
          source: 'whatsapp_stop',
        },
      });
    });

    it('ignores ordinary messages that merely mention stop', async () => {
      const prisma = prismaFor();
      await build(prisma).handleWebhookPayload(inbound('when does the bus stop?'));
      expect(prisma.whatsappMessage.create).toHaveBeenCalled();
      expect(prisma.marketingOptOut.create).not.toHaveBeenCalled();
    });
  });
});
