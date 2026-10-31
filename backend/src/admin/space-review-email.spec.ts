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
      space: {
        findUnique: jest.fn(async () => space),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: jest.fn(async () => ({ id: 'sp-1', approvedAt: new Date(1_700_000_000_000) })),
      },
    };
    const notify = { notify: jest.fn(async () => ({})) };
    const config = { get: () => 'ap-south-1' };
    const svc = new AdminService(prisma as any, {} as any, {} as any, config as any, notify as any, {} as any);
    return { svc, notify, prisma };
  };

  it('approving tells the creator (space.approved, deduped per approval by the kind)', async () => {
    const { svc, notify } = build();
    await svc.approveSpace('sp-1', 'admin-1');
    expect(notify.notify).toHaveBeenCalledWith('u-asha', 'space.approved', {
      spaceId: 'sp-1', approvedAt: new Date(1_700_000_000_000), organizerName: 'Asha', spaceName: 'Robotics Club', spaceSlug: 'robotics',
    });
  });

  it('rejecting tells the creator with the reason', async () => {
    const { svc, notify } = build();
    await svc.rejectSpace('sp-1', 'admin-1', ' Add a logo ');
    expect(notify.notify).toHaveBeenCalledWith(
      'u-asha',
      'space.rejected',
      expect.objectContaining({ spaceId: 'sp-1', rejectionReason: 'Add a logo' }),
    );
  });

  it.each([
    ['approve', (svc: AdminService) => svc.approveSpace('sp-1', 'admin-1'), /already approved/],
    ['reject', (svc: AdminService) => svc.rejectSpace('sp-1', 'admin-1', 'x'), /already rejected/],
  ] as const)('a double-click %s loses the atomic claim and tells nobody twice', async (_n, act, msg) => {
    const { svc, notify, prisma } = build();
    prisma.space.updateMany.mockResolvedValue({ count: 0 });
    await expect(act(svc)).rejects.toThrow(msg);
    expect(notify.notify).not.toHaveBeenCalled();
  });
});
