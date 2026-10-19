import { UsersService } from './users.service';
import { SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE } from '../support/subject-cases';

// D24: deletion is one PRIVACY case; request, cancel and erase are SYSTEM lines on it.
describe('UsersService account deletion case', () => {
  function build(user: Record<string, unknown>) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', deletedAt: null, ...user }),
        update: jest.fn((a) => ({ id: 'u1', ...a.data })),
      },
      space: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const events = { emitAsync: jest.fn().mockResolvedValue([]) };
    const svc = new UsersService(prisma as never, {} as never, {} as never, events as never);
    // Registration blockers have their own spec; none here.
    (svc as any).assertRegistrationsAllowDeletion = jest.fn();
    return { svc, events };
  }

  it('opens the case first, then posts the request line as waiting on the person', async () => {
    const { svc, events } = build({ deletionRequestedAt: null });
    await svc.requestAccountDeletion('u1');
    const [[n1, open], [n2, line]] = events.emitAsync.mock.calls;
    expect(n1).toBe(SUBJECT_CASE_OPEN);
    expect(open).toMatchObject({ subjectType: 'User', subjectId: 'u1', requesterId: 'u1', kind: 'PRIVACY', desk: 'PLATFORM' });
    expect(n2).toBe(SUBJECT_CASE_UPDATE);
    expect(line).toMatchObject({ subjectId: 'u1', status: 'PENDING' });
    expect(line.text).toMatch(/^Deletion requested\. .* unless you cancel/);
  });

  it('a repeat request adds nothing', async () => {
    const { svc, events } = build({ deletionRequestedAt: new Date() });
    await svc.requestAccountDeletion('u1');
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('cancel closes the case with a line; with nothing pending it posts nothing', async () => {
    const a = build({ deletionRequestedAt: new Date() });
    await a.svc.cancelAccountDeletion('u1');
    expect(a.events.emitAsync.mock.calls[1][1]).toMatchObject({ text: 'Deletion cancelled. The account stays.', status: 'CLOSED' });

    const b = build({ deletionRequestedAt: null });
    await b.svc.cancelAccountDeletion('u1');
    expect(b.events.emitAsync).not.toHaveBeenCalled();
  });

  it('a failing case never fails the deletion', async () => {
    const { svc, events } = build({ deletionRequestedAt: null });
    events.emitAsync.mockRejectedValue(new Error('down'));
    await expect(svc.requestAccountDeletion('u1')).resolves.toHaveProperty('deletionScheduledFor');
  });
});
