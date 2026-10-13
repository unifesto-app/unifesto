import { SpacesService } from './spaces.service';

// S24: member search must not leak platform users' emails by substring.
describe('SpacesService.searchAddableUsers', () => {
  const build = (users: unknown[]) => {
    const prisma = {
      space: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }) },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue(users) },
    };
    const svc = new SpacesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { svc, prisma };
  };

  it('matches email only exactly, never by substring', async () => {
    const { svc, prisma } = build([]);
    await svc.searchAddableUsers('s1', 'gmail');
    const where = prisma.user.findMany.mock.calls[0][0].where;
    const emailClause = where.OR.find((c: any) => c.identities);
    expect(emailClause.identities.some.email).toEqual({
      equals: 'gmail',
      mode: 'insensitive',
    });
  });

  it('hides the email of users found by name', async () => {
    const { svc } = build([
      { id: 'u1', fullName: 'Jane', identities: [{ email: 'jane@x.com' }] },
    ]);
    const res = await svc.searchAddableUsers('s1', 'jan');
    expect(res.users[0].identities).toEqual([]);
  });

  it('keeps the email when the searcher typed it exactly', async () => {
    const { svc } = build([
      { id: 'u1', fullName: 'Jane', identities: [{ email: 'Jane@X.com' }] },
    ]);
    const res = await svc.searchAddableUsers('s1', ' jane@x.com ');
    expect(res.users[0].identities).toEqual([{ email: 'Jane@X.com' }]);
  });
});
