import { SpacesService } from './spaces.service';
import { NotificationEvents } from '../notifications/notifications.constants';
import { NOTIFY_KINDS } from '../notifications/notify.kinds';

// Q19: the requester hears (push + email) when Platform decides a space request.
describe('SpacesService space request decisions', () => {
  function build() {
    const req = { id: 'r1', userId: 'u1', name: 'Robotics Club', status: 'PENDING', tags: [], createdAt: new Date() };
    const tx = {
      space: { create: jest.fn((a) => ({ id: 's1', ...a.data })) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-sa' }) },
      userRole: { create: jest.fn() },
      orgSubscription: { create: jest.fn() },
      spaceRequest: { update: jest.fn() },
    };
    const prisma = {
      spaceRequest: { findUnique: jest.fn().mockResolvedValue(req), update: jest.fn((a) => ({ ...req, ...a.data })) },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Asha Rao', username: 'asha' }) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const events = { emit: jest.fn() };
    const svc = new SpacesService(prisma as never, {} as never, {} as never, {} as never, {} as never, events as never);
    const batch = () => events.emit.mock.calls.find(([name]) => name === NotificationEvents.NotifyBatch)?.[1];
    return { svc, batch };
  }

  it('approve tells the requester, and the push opens the new space', async () => {
    const { svc, batch } = build();
    await svc.approveSpaceRequest('r1', 'admin');
    const { kind, items } = batch();
    expect(kind).toBe('space.approved');
    expect(items[0]).toMatchObject({
      userId: 'u1',
      data: { spaceId: 's1', spaceName: 'Robotics Club', organizerName: 'Asha Rao' },
    });
    expect(NOTIFY_KINDS['space.approved'].push(items[0].data).deepLink).toBe('unifesto://manage/space/s1');
  });

  it('reject tells the requester the reason, and the push opens it', async () => {
    const { svc, batch } = build();
    await svc.rejectSpaceRequest('r1', 'admin', ' Use your club email ');
    const { kind, items } = batch();
    expect(kind).toBe('space.rejected');
    expect(items[0]).toMatchObject({
      userId: 'u1',
      data: { requestId: 'r1', spaceName: 'Robotics Club', rejectionReason: 'Use your club email' },
    });
    expect(NOTIFY_KINDS['space.rejected'].push(items[0].data).deepLink).toBe('unifesto://space-request');
  });
});
