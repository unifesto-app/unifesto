import { findOrCreateUserByEmail } from './collaborator-invite';

/** E1: one find-or-create for every invite by email. */
describe('findOrCreateUserByEmail', () => {
  const prisma = (rows: object[]): any => ({
    userIdentity: { findMany: jest.fn(async () => rows) },
    user: { create: jest.fn(async () => ({ id: 'new-user' })), update: jest.fn(async () => ({})) },
  });

  it('reuses the account behind the email and never renames it for an inviter', async () => {
    const db = prisma([{ userId: 'u1', email: 'ana@x.io', user: { fullName: null } }]);
    await expect(findOrCreateUserByEmail(db, ' Ana@X.io ', 'Mallory')).resolves.toBe('u1');
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('names a nameless account only when the caller asks (attendee import)', async () => {
    const db = prisma([{ userId: 'u1', email: 'ana@x.io', user: { fullName: null } }]);
    await findOrCreateUserByEmail(db, 'ana@x.io', 'Ana', { fillMissingName: true });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { fullName: 'Ana' } });
  });

  it('makes a claimable placeholder: unverified email identity and a placeholder mobile', async () => {
    const db = prisma([]);
    await expect(findOrCreateUserByEmail(db, 'New@X.io', ' Ravi ')).resolves.toBe('new-user');
    const data = db.user.create.mock.calls[0][0].data;
    expect(data.mobileNumber).toMatch(/^\+0\d{9}$/);
    expect(data).toMatchObject({
      mobileVerified: false,
      fullName: 'Ravi',
      identities: { create: { provider: 'EMAIL', email: 'new@x.io', emailVerified: false, isPrimary: true } },
    });
  });

  it('refuses a blank email', async () => {
    await expect(findOrCreateUserByEmail(prisma([]), '  ')).rejects.toThrow('A valid email is required.');
  });
});
