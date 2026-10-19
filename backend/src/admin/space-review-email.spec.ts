import { SpaceStatus } from '@prisma/client';
import { AdminService } from './admin.service';

/** C9 + C2: an Apex approve or reject tells the space's creator through notify(). */
describe('AdminService space review notices', () => {
  const build = () => {
    const space = {
      id: 'sp-1', name: 'Robotics Club', slug: 'robotics', status: SpaceStatus.PENDING, createdBy: 'u-asha',
      creator: { fullName: 'Asha', username: null },
    };
    const prisma = {
      space: { findUnique: jest.fn(async () => space), update: jest.fn(async () => ({ id: 'sp-1' })) },
    };
    const email = {
      sendSpaceApproved: jest.fn(async () => undefined),
      sendSpaceRejected: jest.fn(async () => undefined),
    };
    const notify = { notify: jest.fn(async () => ({})) };
    const config = { get: () => 'ap-south-1' };
    const svc = new AdminService(prisma as any, {} as any, {} as any, config as any, email as any, notify as any);
    return { svc, email, notify };
  };

  it('approving tells the creator (space.approved, deduped per space by the kind)', async () => {
    const { svc, email, notify } = build();
    await svc.approveSpace('sp-1', 'admin-1');
    expect(notify.notify).toHaveBeenCalledWith('u-asha', 'space.approved', {
      spaceId: 'sp-1', organizerName: 'Asha', spaceName: 'Robotics Club', spaceSlug: 'robotics',
    });
    expect(email.sendSpaceApproved).not.toHaveBeenCalled();
  });

  it('rejecting tells the creator with the reason', async () => {
    const { svc, email, notify } = build();
    await svc.rejectSpace('sp-1', 'admin-1', ' Add a logo ');
    expect(notify.notify).toHaveBeenCalledWith(
      'u-asha',
      'space.rejected',
      expect.objectContaining({ spaceId: 'sp-1', rejectionReason: 'Add a logo' }),
    );
    expect(email.sendSpaceRejected).not.toHaveBeenCalled();
  });
});
