import { BroadcastHoldStatus, BroadcastKind, Prisma, SupportCaseKind, SupportDesk } from '@prisma/client';
import { BROADCAST_DECIDED, BroadcastCheck, type Broadcast } from './broadcast-check';
import { SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE } from '../support/subject-cases';
import type { AiService } from './ai.service';
import type { PrismaService } from '../prisma/prisma.service';

/** AI19: unverified + flagged waits for staff; everything else goes out as before. */
describe('BroadcastCheck', () => {
  const upi = 'Pay ₹500 on UPI to 98xxxx to confirm your seat';
  const b: Broadcast = { kind: BroadcastKind.PUSH, refId: 'c1', spaceId: 's1', eventId: 'e1', senderId: 'org', text: upi };
  const flagged = { ok: true, text: '', json: { flag: true, signals: ['OFF_PLATFORM_PAYMENT'], reason: 'Asks to pay ₹500 on UPI to 98xxxx' } };
  const clean = { ok: true, text: '', json: { flag: false, signals: [], reason: '' } };

  function setup(o: { ai?: unknown; verified?: boolean; prior?: BroadcastHoldStatus; caseId?: string | null } = {}) {
    const prisma = {
      broadcastHold: {
        findUnique: jest.fn().mockResolvedValue(o.prior ? { status: o.prior } : null),
        create: jest.fn().mockResolvedValue({ id: 'h1' }),
        delete: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      space: { findUnique: jest.fn().mockResolvedValue({ name: 'Scam Club', verifiedAt: o.verified ? new Date() : null }) },
      event: { findUnique: jest.fn().mockResolvedValue({ title: 'Fest' }) },
      userRole: { findFirst: jest.fn().mockResolvedValue({ userId: 'staff' }) },
    };
    const ai = { run: jest.fn().mockResolvedValue(o.ai ?? flagged) };
    const events = {
      emitAsync: jest.fn().mockResolvedValue(['caseId' in o ? o.caseId : 'case1']),
      emit: jest.fn(),
    };
    const svc = new BroadcastCheck(prisma as unknown as PrismaService, ai as unknown as AiService, events as never);
    return { svc, prisma, ai, events };
  }

  it('holds a flagged message from an Unverified space and opens a staff-only Platform REPORT case', async () => {
    const { svc, prisma, ai, events } = setup();
    await expect(svc.clear(b)).resolves.toBe(false);
    expect(ai.run.mock.calls[0][0]).toBe('broadcast_check');
    expect(ai.run.mock.calls[0][1]).toMatchObject({ spaceId: 's1', subject: 'push:c1' });
    expect(ai.run.mock.calls[0][1].userId).toBeUndefined(); // a system call: no user cap, never billable
    expect(prisma.broadcastHold.create.mock.calls[0][0].data).toMatchObject({ kind: 'PUSH', refId: 'c1', reason: 'Asks to pay ₹500 on UPI to 98xxxx' });
    const [name, open] = events.emitAsync.mock.calls[0];
    expect(name).toBe(SUBJECT_CASE_OPEN);
    expect(open).toMatchObject({
      subjectType: 'BroadcastHold',
      subjectId: 'h1',
      requesterId: 'staff',
      actorId: 'org',
      kind: SupportCaseKind.REPORT,
      desk: SupportDesk.PLATFORM,
      notify: true,
    });
    expect(open.message).toMatch(/Why: Asks to pay ₹500 on UPI/);
  });

  it('sends a normal message, and only logs a flag from a Verified space', async () => {
    const normal = setup({ ai: clean });
    await expect(normal.svc.clear({ ...b, text: 'Reminder: doors open at 9 am, bring your ID.' })).resolves.toBe(true);
    expect(normal.prisma.broadcastHold.create).not.toHaveBeenCalled();

    const verified = setup({ verified: true });
    await expect(verified.svc.clear(b)).resolves.toBe(true);
    expect(verified.prisma.broadcastHold.create).not.toHaveBeenCalled();
    expect(verified.events.emitAsync).not.toHaveBeenCalled();
  });

  it('sends as before when the check is off, capped or fails, or for our own broadcasts', async () => {
    for (const ai of [{ ok: false, reason: 'disabled' }, { ok: false, reason: 'capped' }, { ok: false, reason: 'error' }]) {
      await expect(setup({ ai }).svc.clear(b)).resolves.toBe(true);
    }
    const ours = setup();
    await expect(ours.svc.clear({ ...b, spaceId: null })).resolves.toBe(true);
    expect(ours.ai.run).not.toHaveBeenCalled();
  });

  it('asks once: a decided hold answers for itself', async () => {
    const released = setup({ prior: BroadcastHoldStatus.RELEASED });
    await expect(released.svc.clear(b)).resolves.toBe(true);
    expect(released.ai.run).not.toHaveBeenCalled();
    await expect(setup({ prior: BroadcastHoldStatus.HELD }).svc.clear(b)).resolves.toBe(false);
    await expect(setup({ prior: BroadcastHoldStatus.BLOCKED }).svc.clear(b)).resolves.toBe(false);
  });

  it('never holds what nobody would see: no case, no hold', async () => {
    const { svc, prisma } = setup({ caseId: null });
    await expect(svc.clear(b)).resolves.toBe(true);
    expect(prisma.broadcastHold.delete).toHaveBeenCalledWith({ where: { id: 'h1' } });

    // Two workers raced to the same hold: it is held either way.
    const race = setup();
    race.prisma.broadcastHold.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(race.svc.clear(b)).resolves.toBe(false);
  });

  it('staff release or block once; the sender service does the sending', async () => {
    const { svc, prisma, events } = setup();
    prisma.broadcastHold.findUnique.mockResolvedValue({ id: 'h1', kind: 'HACKATHON', refId: 'a1', payload: { title: 'x' } });
    await expect(svc.decide('h1', true, 'staff', 'looks fine')).resolves.toEqual({ status: 'RELEASED' });
    expect(events.emit).toHaveBeenCalledWith(BROADCAST_DECIDED, { kind: 'HACKATHON', refId: 'a1', release: true, payload: { title: 'x' } });
    expect(events.emit).toHaveBeenCalledWith(
      SUBJECT_CASE_UPDATE,
      expect.objectContaining({ subjectId: 'h1', text: 'Released: the message goes out now. Note: looks fine', status: 'RESOLVED' }),
    );

    prisma.broadcastHold.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.decide('h1', false, 'staff')).rejects.toThrow('already released or blocked');
  });
});
