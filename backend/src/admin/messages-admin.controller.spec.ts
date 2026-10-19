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
        { channel: 'EMAIL', recipient: { equals: 'Asha@Example.com', mode: 'insensitive' } },
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

  it('phoneForms covers stored and E.164 forms', () => {
    expect(phoneForms('+91 98480 12345')).toEqual(expect.arrayContaining(['+919848012345', '919848012345']));
  });
});
