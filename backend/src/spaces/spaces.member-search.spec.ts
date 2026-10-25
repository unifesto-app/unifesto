import { SpacesService } from './spaces.service';

// S24: member search must not leak platform users' emails by substring.
describe('SpacesService.searchAddableUsers', () => {
  const build = (users: unknown[], identities: unknown[] = []) => {
    const prisma = {
      userIdentity: { findMany: jest.fn().mockResolvedValue(identities) },
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
    // Not an address: no email clause at all.
    expect(prisma.userIdentity.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany.mock.calls[0][0].where.OR).toHaveLength(2);
  });

  it('an ILIKE wildcard (`%`, `_`) never matches other addresses (J17)', async () => {
    const { svc, prisma } = build([], [
      { userId: 'u1', email: 'jane@x.com' },
      { userId: 'u2', email: 'a_b@x.com' },
    ]);
    await svc.searchAddableUsers('s1', '%@x.com');
    expect(prisma.user.findMany.mock.calls[0][0].where.OR).toHaveLength(2);
    await svc.searchAddableUsers('s1', 'A_B@x.com');
    expect(prisma.user.findMany.mock.calls[1][0].where.OR[2]).toEqual({ id: { in: ['u2'] } });
  });

  it('hides the email of users found by name', async () => {
    const { svc } = build([
      { id: 'u1', fullName: 'Jane', identities: [{ email: 'jane@x.com' }] },
    ]);
    const res = await svc.searchAddableUsers('s1', 'jan');
    expect(res.users[0].identities).toEqual([]);
  });

  it('keeps the email when the searcher typed it exactly', async () => {
    const { svc } = build(
      [{ id: 'u1', fullName: 'Jane', identities: [{ email: 'Jane@X.com' }] }],
      [{ userId: 'u1', email: 'Jane@X.com' }],
    );
    const res = await svc.searchAddableUsers('s1', ' jane@x.com ');
    expect(res.users[0].identities).toEqual([{ email: 'Jane@X.com' }]);
  });
});
