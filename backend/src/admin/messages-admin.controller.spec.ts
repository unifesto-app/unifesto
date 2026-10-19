import { MessagesAdminController, phoneForms } from './messages-admin.controller';

describe('MessagesAdminController', () => {
  const build = () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          mobileNumber: '9848012345',
          identities: [{ email: 'Asha@Example.com' }, { email: null }],
        }),
      },
      messageDelivery: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, ctrl: new MessagesAdminController(prisma) };
  };

  it("a user's history includes rows logged by address only (no userId)", async () => {
    const { prisma, ctrl } = build();
    await ctrl.list({ userId: 'u1' });
    const where = prisma.messageDelivery.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { userId: 'u1' },
        { channel: 'EMAIL', recipient: { in: ['Asha@Example.com', 'asha@example.com'] } },
        { channel: 'WHATSAPP', recipient: { in: expect.arrayContaining(['+919848012345']) } },
      ]),
    );
  });

  it('pages with a cursor and filters by a status list', async () => {
    const { prisma, ctrl } = build();
    prisma.messageDelivery.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const res = await ctrl.list({ status: 'FAILED,SUPPRESSED', cursor: 'z', limit: 2 });
    const args = prisma.messageDelivery.findMany.mock.calls[0][0];
    expect(args.where.AND).toEqual([{ status: { in: ['FAILED', 'SUPPRESSED'] } }]);
    expect(args).toMatchObject({ take: 3, cursor: { id: 'z' }, skip: 1 });
    expect(res).toEqual({ items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'b' });
  });

  it('bounds a free-text recipient search to the last 30 days unless dated', async () => {
    const { prisma, ctrl } = build();
    await ctrl.list({ recipient: 'asha' });
    const gte: Date = prisma.messageDelivery.findMany.mock.calls[0][0].where.AND[1].createdAt.gte;
    expect(Date.now() - gte.getTime()).toBeGreaterThan(29 * 86_400_000);
    await ctrl.list({ recipient: 'asha', from: '2026-01-01T00:00:00Z' });
    expect(prisma.messageDelivery.findMany.mock.calls[1][0].where.AND[1].createdAt.gte).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('phoneForms covers stored and E.164 forms', () => {
    expect(phoneForms('+91 98480 12345')).toEqual(expect.arrayContaining(['+919848012345', '919848012345']));
  });
});
