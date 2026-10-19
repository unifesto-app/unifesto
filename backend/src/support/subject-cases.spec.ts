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

  it('skips records with no case and swallows errors', async () => {
    const none = setup(null);
    await none.cases.onUpdate({ subjectType: 'SpaceRequest', subjectId: 'r1', text: 'x' });
    expect(none.prisma.$transaction).not.toHaveBeenCalled();

    const broken = setup(null);
    broken.prisma.supportTicket.findFirst.mockRejectedValue(new Error('db down'));
    await expect(broken.cases.onOpen(open)).resolves.toBeNull();
  });
});
