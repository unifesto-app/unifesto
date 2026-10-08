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
      where: { userId: { in: ['off', 'on', 'no-row'] }, emailEnabled: false },
      select: { userId: true },
    });
  });

  it('skips the query for an empty list', async () => {
    const { findMany, prisma } = prismaWith([]);

    expect((await emailOptedOutUserIds(prisma, [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
