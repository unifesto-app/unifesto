/// <reference types="jest" />
import { ForbiddenException } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { SpacesService } from './spaces.service';

/** Q31: a Space Admin adds a teammate by email, whether or not they have an account yet. */
function setup(existing: { userId: string } | null = null) {
  const prisma: any = {
    space: { findUnique: jest.fn().mockResolvedValue({ id: 's1', name: 'Robotics Club', slug: 'robotics' }) },
    // The actor is the space's Space Admin.
    userRole: {
      findMany: jest.fn().mockResolvedValue([{ spaceId: 's1', role: { code: RoleCode.SPACE_ADMIN } }]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'ur-1', ...data })),
    },
    role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-member' }) },
    user: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === 'actor'
          ? { fullName: 'Asha' }
          : { id: where.id, fullName: null, identities: [{ email: 'ravi@college.edu' }] },
      ),
      create: jest.fn().mockResolvedValue({ id: 'invited' }),
    },
    // findIdentityByEmail
    userIdentity: {
      findMany: jest.fn(async () => (existing ? [{ email: 'ravi@college.edu', ...existing }] : [])),
    },
  };
  const email: any = { sendCollaboratorInvite: jest.fn().mockResolvedValue(undefined) };
  const svc = new SpacesService(prisma, {} as any, email, {} as any, {} as any);
  return { svc, prisma, email };
}

describe('Q31: invite a space member by email', () => {
  it('someone with no account gets a claimable one, the role, and the invite email', async () => {
    const { svc, prisma, email } = setup();

    await svc.addSpaceMember('s1', 'actor', { email: ' Ravi@College.edu ' }, RoleCode.MEMBER);

    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
      mobileVerified: false,
      identities: { create: { provider: 'EMAIL', providerUserId: 'ravi@college.edu', emailVerified: false } },
    });
    expect(prisma.userRole.create.mock.calls[0][0].data).toMatchObject({ userId: 'invited', spaceId: 's1', assignedBy: 'actor' });
    expect(email.sendCollaboratorInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ravi@college.edu', target: 'Robotics Club' }),
      expect.anything(),
    );
  });

  it('an email that already has an account adds that account, no new one', async () => {
    const { svc, prisma } = setup({ userId: 'ravi' });
    await svc.addSpaceMember('s1', 'actor', { email: 'ravi@college.edu' }, RoleCode.MEMBER);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userRole.create.mock.calls[0][0].data.userId).toBe('ravi');
  });

  it("a role I can't assign mints no account", async () => {
    const { svc, prisma } = setup();
    prisma.userRole.findMany.mockResolvedValue([{ spaceId: 's1', role: { code: RoleCode.MEMBER } }]);
    await expect(
      svc.addSpaceMember('s1', 'actor', { email: 'ravi@college.edu' }, RoleCode.MEMBER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
