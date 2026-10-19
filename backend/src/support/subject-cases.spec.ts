import { SupportCaseKind, SupportDesk, SupportTicketStatus } from '@prisma/client';
import { SubjectCases } from './subject-cases';
import type { PrismaService } from '../prisma/prisma.service';

/** D5: a typed record opens its case once, decisions land as SYSTEM lines, failures never throw. */
describe('SubjectCases', () => {
  const open = {
    subjectType: 'SpaceRequest',
    subjectId: 'r1',
    requesterId: 'u1',
    kind: SupportCaseKind.REQUEST,
    requestType: 'SPACE',
    desk: SupportDesk.PLATFORM,
    subject: 'Space request: Robotics Club',
    message: 'Please create my space.',
  };

  function setup(existing: { id: string; requesterId: string } | null) {
    const prisma = {
      supportTicket: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({ id: 'c-new' }),
        update: jest.fn((a) => a),
      },
      supportMessage: { create: jest.fn((a) => a) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return { prisma, cases: new SubjectCases(prisma as unknown as PrismaService) };
  }

  it('opens one case per record', async () => {
    const a = setup(null);
    expect(await a.cases.onOpen(open)).toBe('c-new');
    expect(a.prisma.supportTicket.create.mock.calls[0][0].data).toMatchObject({
      kind: 'REQUEST',
      requestType: 'SPACE',
      desk: 'PLATFORM',
      subjectType: 'SpaceRequest',
      subjectId: 'r1',
    });

    const b = setup({ id: 'c-old', requesterId: 'u1' });
    expect(await b.cases.onOpen(open)).toBe('c-old');
    expect(b.prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it('posts a SYSTEM line and resolves the case', async () => {
    const { prisma, cases } = setup({ id: 'c1', requesterId: 'u1' });
    await cases.onUpdate({ subjectType: 'SpaceRequest', subjectId: 'r1', text: 'Approved', status: SupportTicketStatus.RESOLVED });
    expect(prisma.supportMessage.create.mock.calls[0][0].data).toMatchObject({ ticketId: 'c1', authorId: 'u1', side: 'SYSTEM', body: 'Approved' });
    expect(prisma.supportTicket.update.mock.calls[0][0].data).toMatchObject({ status: 'RESOLVED', closedAt: null });
  });

  it('D6: moves the desk once, keeping the space read like an escalation, and can target a case by id', async () => {
    const { prisma, cases } = setup({ id: 'c1', requesterId: 'u1', desk: SupportDesk.SPACE } as any);
    await cases.onUpdate({ subjectType: 'RefundRequest', subjectId: 'r1', caseId: 'help-1', text: 'Forwarded', desk: SupportDesk.PLATFORM });
    expect(prisma.supportTicket.findFirst.mock.calls[0][0].where).toEqual({ id: 'help-1' });
    expect(prisma.supportTicket.update.mock.calls[0][0].data).toMatchObject({ desk: 'PLATFORM', escalatedAt: expect.any(Date) });

    const already = setup({ id: 'c1', requesterId: 'u1', desk: SupportDesk.PLATFORM } as any);
    await already.cases.onUpdate({ subjectType: 'RefundRequest', subjectId: 'r1', text: 'Refunded', desk: SupportDesk.PLATFORM });
    expect(already.prisma.supportTicket.update.mock.calls[0][0].data).not.toHaveProperty('escalatedAt');
  });

  it('D6: a case raised for the requester starts with a SYSTEM line', async () => {
    const { prisma, cases } = setup(null);
    await cases.onOpen({ ...open, raisedForRequester: true });
    expect(prisma.supportTicket.create.mock.calls[0][0].data.messages.create).toMatchObject({ side: 'SYSTEM', authorId: 'u1' });
  });

  it('D6: an update emitted right after its open waits for the case', async () => {
    const { prisma, cases } = setup(null);
    let created = false;
    prisma.supportTicket.create.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      created = true;
      return { id: 'c-new' };
    });
    prisma.supportTicket.findFirst.mockImplementation(async () => (created ? { id: 'c-new', requesterId: 'u1' } : null));
    await Promise.all([cases.onOpen(open), cases.onUpdate({ subjectType: 'SpaceRequest', subjectId: 'r1', text: 'Approved' })]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('skips records with no case and swallows errors', async () => {
    const none = setup(null);
    await none.cases.onUpdate({ subjectType: 'SpaceRequest', subjectId: 'r1', text: 'x' });
    expect(none.prisma.$transaction).not.toHaveBeenCalled();

    const broken = setup(null);
    broken.prisma.supportTicket.findFirst.mockRejectedValue(new Error('db down'));
    await expect(broken.cases.onOpen(open)).resolves.toBeNull();
  });
});
