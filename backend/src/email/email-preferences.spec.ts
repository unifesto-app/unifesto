import { emailOptedOutUserIds } from './email-preferences';

describe('emailOptedOutUserIds', () => {
  const prismaWith = (rows: { userId: string }[]) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    return { findMany, prisma: { notificationSettings: { findMany } } as any };
  };

  it('returns only users with emailEnabled=false (no row ⇒ enabled)', async () => {
    const { findMany, prisma } = prismaWith([{ userId: 'off' }]);

    const out = await emailOptedOutUserIds(prisma, ['off', 'on', 'no-row']);

    expect([...out]).toEqual(['off']);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['off', 'on', 'no-row'] }, OR: [{ emailEnabled: false }] },
      select: { userId: true },
    });
  });

  it('with an optional category, also honours that category email switch', async () => {
    const { findMany, prisma } = prismaWith([{ userId: 'reminders-off' }]);

    await emailOptedOutUserIds(prisma, ['a'], 'eventReminders');
    expect(findMany.mock.calls[0][0].where.OR).toEqual([{ emailEnabled: false }, { emailEventReminders: false }]);

    await emailOptedOutUserIds(prisma, ['a'], 'newEvents');
    expect(findMany.mock.calls[1][0].where.OR).toEqual([{ emailEnabled: false }, { emailNewEvents: false }]);
  });

  it('a transactional category has no email switch: only the master applies', async () => {
    const { findMany, prisma } = prismaWith([]);

    await emailOptedOutUserIds(prisma, ['a'], 'registrationUpdates');
    expect(findMany.mock.calls[0][0].where.OR).toEqual([{ emailEnabled: false }]);
  });

  it('skips the query for an empty list', async () => {
    const { findMany, prisma } = prismaWith([]);

    expect((await emailOptedOutUserIds(prisma, [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
