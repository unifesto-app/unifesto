import { SpacesService } from './spaces.service';
import { NotificationEvents } from '../notifications/notifications.constants';
import { NOTIFY_KINDS } from '../notifications/notify.kinds';
import { SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE } from '../support/subject-cases';

// Q19: the requester hears (push + email) when Platform decides a space request.
// Q29: a new request is live at once; only requests from before Q29 still wait.
describe('SpacesService space request decisions', () => {
  function build(opts: { claimed?: number; pendingEvents?: string[] } = {}) {
    const req = { id: 'r1', userId: 'u1', name: 'Robotics Club', status: 'PENDING', tags: [], createdAt: new Date() };
    const tx = {
      space: { create: jest.fn((a) => ({ id: 's1', ...a.data })) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-sa' }) },
      userRole: { create: jest.fn() },
      orgSubscription: { create: jest.fn() },
      spaceRequest: {
        create: jest.fn((a) => ({ ...req, ...a.data })),
        updateMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
      },
    };
    const prisma = {
      spaceRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ id: 'r1' }]),
        findUnique: jest.fn().mockResolvedValue(req),
        update: jest.fn((a) => ({ ...req, ...a.data })),
      },
      eventRequest: {
        findMany: jest.fn().mockResolvedValue((opts.pendingEvents ?? []).map((id) => ({ id }))),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Asha Rao', username: 'asha' }) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const events = { emit: jest.fn() };
    const svc = new SpacesService(prisma as never, {} as never, {} as never, {} as never, {} as never, events as never);
    const batch = () => events.emit.mock.calls.find(([name]) => name === NotificationEvents.NotifyBatch)?.[1];
    const emitted = (name: string) => events.emit.mock.calls.filter(([n]) => n === name).map(([, e]) => e);
    return { svc, tx, batch, emitted };
  }

  it('a new request makes the space at once: live, Unverified, run by the requester', async () => {
    const { svc, tx, batch, emitted } = build();
    const out = await svc.createSpaceRequest('u1', { name: 'Robotics Club', description: 'Bots', authorityConfirmed: true });
    expect(tx.spaceRequest.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', status: 'APPROVED' });
    const space = tx.space.create.mock.calls[0][0].data;
    expect(space).toMatchObject({ name: 'Robotics Club', createdBy: 'u1', status: 'ACTIVE', approvedBy: null });
    expect(space.verifiedAt).toBeUndefined(); // Unverified
    expect(tx.userRole.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', roleId: 'role-sa', spaceId: 's1' });
    expect(tx.orgSubscription.create).toHaveBeenCalled();
    expect(out).toMatchObject({ status: 'APPROVED', space: { id: 's1', name: 'Robotics Club' } });
    expect(batch().kind).toBe('space.approved');
    expect(emitted(SUBJECT_CASE_OPEN)).toEqual([]); // nothing for staff to review
  });

  it('approve never makes two spaces from one request', async () => {
    const { svc, tx } = build({ claimed: 0 });
    await expect(svc.approveSpaceRequest('r1', 'admin')).rejects.toThrow(/already been reviewed/);
    expect(tx.space.create).not.toHaveBeenCalled();
  });

  it('the launch sweep makes waiting requests live and resolves their cases with a SYSTEM line', async () => {
    const { svc, tx, emitted } = build({ pendingEvents: ['gone'] });
    await svc.goLiveWaitingRequests();
    expect(tx.spaceRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'PENDING' },
      data: { status: 'APPROVED', reviewedBy: null },
    });
    expect(tx.space.create.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', approvedBy: null });
    expect(emitted(SUBJECT_CASE_UPDATE)).toEqual([
      expect.objectContaining({
        subjectType: 'SpaceRequest',
        subjectId: 'r1',
        actorId: null,
        status: 'RESOLVED',
        text: expect.stringMatching(/^Unifesto approved the space request\. Robotics Club is live\. Note: Spaces now go live at once/),
      }),
    ]);
  });

  it('the sweep shrugs off a request another replica already made live', async () => {
    const { svc, tx } = build({ claimed: 0 });
    await expect(svc.goLiveWaitingRequests()).resolves.toBeUndefined();
    expect(tx.space.create).not.toHaveBeenCalled();
  });

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
