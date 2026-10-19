import { SpaceStatus } from '@prisma/client';
import { AdminService } from './admin.service';

/** C9: an Apex approve or reject tells the space's creator by email. */
describe('AdminService space review emails', () => {
  const build = () => {
    const space = {
      id: 'sp-1', name: 'Robotics Club', slug: 'robotics', status: SpaceStatus.PENDING,
      creator: { fullName: 'Asha', username: null, identities: [{ email: 'asha@x.in' }] },
    };
    const prisma = {
      space: { findUnique: jest.fn(async () => space), update: jest.fn(async () => ({ id: 'sp-1' })) },
    };
    const email = {
      sendSpaceApproved: jest.fn(async () => undefined),
      sendSpaceRejected: jest.fn(async () => undefined),
    };
    const config = { get: () => 'ap-south-1' };
    const svc = new AdminService(prisma as any, {} as any, {} as any, config as any, email as any);
    return { svc, email };
  };

  it('approving emails the creator', async () => {
    const { svc, email } = build();
    await svc.approveSpace('sp-1', 'admin-1');
    expect(email.sendSpaceApproved).toHaveBeenCalledWith({
      email: 'asha@x.in', organizerName: 'Asha', spaceName: 'Robotics Club', spaceSlug: 'robotics',
    });
  });

  it('rejecting emails the creator with the reason', async () => {
    const { svc, email } = build();
    await svc.rejectSpace('sp-1', 'admin-1', ' Add a logo ');
    expect(email.sendSpaceRejected).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'asha@x.in', rejectionReason: 'Add a logo' }),
    );
  });
});
