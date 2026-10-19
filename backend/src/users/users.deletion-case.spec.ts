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

// I5: a due deletion that fails or is blocked says so on the case, once.
describe('UsersService.purgeDueDeletions reporting', () => {
  function build(lastLine: string | null = null) {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
      supportMessage: { findFirst: jest.fn().mockResolvedValue(lastLine ? { body: lastLine } : null) },
    };
    const events = { emitAsync: jest.fn().mockResolvedValue([]) };
    const svc = new UsersService(prisma as never, {} as never, {} as never, events as never);
    (svc as any).assertAccountCanClose = jest.fn();
    const lines = () => events.emitAsync.mock.calls.filter(([n]) => n === SUBJECT_CASE_UPDATE).map(([, l]) => l);
    return { svc, lines, prisma };
  }

  it('a failed erasure is logged and posted to the case for the desk', async () => {
    const { svc, lines } = build();
    (svc as any).closeAccount = jest.fn().mockRejectedValue(new Error('FK violation'));
    await expect(svc.purgeDueDeletions()).resolves.toEqual({ closed: 0, blocked: 0 });
    expect(lines()).toEqual([expect.objectContaining({ status: 'OPEN', text: expect.stringMatching(/could not finish/) })]);
  });

  it('a blocked erasure tells the person why, and is not repeated daily', async () => {
    const { ConflictException } = jest.requireActual('@nestjs/common');
    const a = build();
    (a.svc as any).assertAccountCanClose = jest.fn().mockRejectedValue(new ConflictException('You have an upcoming ticket for Fest.'));
    await a.svc.purgeDueDeletions();
    expect(a.lines()).toEqual([
      expect.objectContaining({ status: 'PENDING', text: 'Deletion is on hold: You have an upcoming ticket for Fest.' }),
    ]);

    const b = build('Deletion is on hold: You have an upcoming ticket for Fest.');
    (b.svc as any).assertAccountCanClose = jest.fn().mockRejectedValue(new ConflictException('You have an upcoming ticket for Fest.'));
    await b.svc.purgeDueDeletions();
    expect(b.lines()).toEqual([]);
  });

  it('erased with leftovers: closes the case, then reopens it naming what is left', async () => {
    const { svc, lines } = build();
    (svc as any).closeAccount = jest.fn().mockResolvedValue({ leftovers: ['Google/Apple sign-in'] });
    await expect(svc.purgeDueDeletions()).resolves.toEqual({ closed: 1, blocked: 0 });
    expect(lines().map((l) => l.status)).toEqual(['CLOSED', 'OPEN']);
    expect(lines()[1].text).toContain('Google/Apple sign-in');
  });
});
