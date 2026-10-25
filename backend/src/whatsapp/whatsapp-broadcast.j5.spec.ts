import { Logger } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

// J5: broadcasts run from their audit row, deduped per person, so they resume.
describe('WhatsApp broadcast runs', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  const config = {
    get: (k: string) =>
      ({ WHATSAPP_PHONE_NUMBER_ID: 'pn', WHATSAPP_ACCESS_TOKEN: 'tok' })[k as 'WHATSAPP_PHONE_NUMBER_ID'],
  };
  const row = {
    id: 'b1', templateName: 'promo', languageCode: 'en', category: 'UTILITY', audience: 'USER',
    spaceId: null, userIds: ['u1', 'u2'], bodyParams: ['Hi {name}'], isTest: false,
    sentCount: 0, failedCount: 0, finishedAt: null as Date | null,
  };
  const build = (queue?: unknown) => {
    const prisma = {
      whatsappBroadcast: {
        findUnique: jest.fn(async () => row),
        update: jest.fn(async () => row),
        create: jest.fn(async () => ({ id: 'b1' })),
      },
    };
    const svc = new WhatsAppService(config as any, prisma as any, {} as any, { emit: jest.fn() } as any, {} as any, queue as any);
    const sends: any[] = [];
    (svc as any).resolveBroadcastRecipients = jest.fn(async () => [
      { userId: 'u1', name: 'Asha', mobileNumber: '+919876543210' },
      { userId: 'u2', name: 'Bo', mobileNumber: '+919876543211' },
    ]);
    (svc as any).sendTemplateMessage = jest.fn(async (...args: any[]) => {
      sends.push(args);
      return true;
    });
    return { svc, prisma, sends };
  };

  it('sends from the stored row with a per-person dedup key and records the tally', async () => {
    const { svc, prisma, sends } = build();
    await expect(svc.runBroadcastById('b1')).resolves.toEqual({ sent: 2, failed: 0 });
    expect(sends.map((a) => a[6].dedupKey)).toEqual(['broadcast:b1:u1', 'broadcast:b1:u2']);
    expect(sends[0][2]).toEqual(['Hi Asha']);
    expect(prisma.whatsappBroadcast.update).toHaveBeenLastCalledWith({
      where: { id: 'b1' },
      data: expect.objectContaining({ sentCount: 2, failedCount: 0, finishedAt: expect.any(Date) }),
    });
  });

  it('a finished broadcast is never re-run', async () => {
    const { svc, sends } = build();
    row.finishedAt = new Date();
    try {
      await svc.runBroadcastById('b1');
    } finally {
      row.finishedAt = null;
    }
    expect(sends).toHaveLength(0);
  });

  it('with a queue, the request only records and enqueues', async () => {
    const queue = { setHandler: jest.fn(), add: jest.fn(async () => true) };
    const { svc, sends } = build(queue);
    (svc as any).isConfigured = () => true;
    (svc as any).templateCategory = async () => 'UTILITY';
    const res = await svc.sendBroadcastTemplate({ adminUserId: 'a1', audience: 'USER', userIds: ['u1', 'u2'], templateName: 'promo' });
    expect(res).toMatchObject({ recipientCount: 2, status: 'started' });
    expect(queue.add).toHaveBeenCalledWith('b1');
    expect(sends).toHaveLength(0);
  });
});
