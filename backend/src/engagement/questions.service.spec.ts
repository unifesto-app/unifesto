import { BadRequestException, ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ASK_LIMIT, MODERATION_FROM, QuestionsService, attendeeVisible, rankQuestions } from './questions.service';

// L2: vote once, moderation transitions, who sees what, the ask rate limit.
describe('QuestionsService', () => {
  const build = (
    opts: { attending?: boolean; operator?: boolean; premoderated?: boolean; question?: object | null; recent?: number } = {},
  ) => {
    const votes: { questionId: string; userId: string }[] = [];
    const prisma = {
      eventRegistration: { count: jest.fn().mockResolvedValue(opts.attending === false ? 0 : 1) },
      groupSeat: { count: jest.fn().mockResolvedValue(0) },
      event: {
        findUnique: jest.fn().mockResolvedValue({ qaPremoderated: opts.premoderated ?? true, agenda: [] }),
        update: jest.fn(),
      },
      eventAgenda: { count: jest.fn().mockResolvedValue(1) },
      question: {
        findFirst: jest.fn().mockResolvedValue(opts.question === undefined ? { status: 'APPROVED' } : opts.question),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(opts.recent ?? 0),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionVote: {
        // Stands in for the unique (question_id, user_id) index.
        create: jest.fn(async ({ data }: { data: (typeof votes)[number] }) => {
          if (votes.some((v) => v.questionId === data.questionId && v.userId === data.userId)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
          }
          votes.push(data);
          return data;
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const authz = { can: jest.fn().mockResolvedValue(!!opts.operator) };
    const gateway = { engagementChanged: jest.fn() };
    const svc = new QuestionsService(prisma as never, authz as never, gateway as never);
    return { svc, prisma, gateway, votes };
  };

  describe('vote', () => {
    it('counts one upvote per person; the second is a conflict', async () => {
      const { svc, votes, gateway } = build();
      await svc.vote('e1', 'q1', 'u1');
      await expect(svc.vote('e1', 'q1', 'u1')).rejects.toBeInstanceOf(ConflictException);
      await svc.vote('e1', 'q1', 'u2');
      expect(votes).toEqual([
        { questionId: 'q1', userId: 'u1' },
        { questionId: 'q1', userId: 'u2' },
      ]);
      expect(gateway.engagementChanged).toHaveBeenCalledTimes(2);
    });

    it.each(['PENDING', 'HIDDEN', 'ANSWERED'])('refuses votes on a %s question', async (status) => {
      const { svc, votes } = build({ question: { status } });
      await expect(svc.vote('e1', 'q1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(votes).toHaveLength(0);
    });

    it('refuses someone not attending, even an operator', async () => {
      const { svc, votes } = build({ attending: false, operator: true });
      await expect(svc.vote('e1', 'q1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(votes).toHaveLength(0);
    });

    it('unvote only removes the caller’s own vote on this event', async () => {
      const { svc, prisma } = build();
      await svc.unvote('e1', 'q1', 'u1');
      expect(prisma.questionVote.deleteMany).toHaveBeenCalledWith({
        where: { questionId: 'q1', userId: 'u1', question: { eventId: 'e1' } },
      });
    });
  });

  describe('ask', () => {
    it('waits for a moderator on a pre-moderated event', async () => {
      const { svc, prisma } = build({ premoderated: true });
      await expect(svc.ask('e1', 'u1', { text: '  Slides?  ' })).resolves.toEqual({ ok: true, status: 'PENDING' });
      expect(prisma.question.create).toHaveBeenCalledWith({
        data: { eventId: 'e1', userId: 'u1', agendaId: null, text: 'Slides?', status: 'PENDING' },
      });
    });

    it('goes straight up on an open event', async () => {
      const { svc } = build({ premoderated: false });
      await expect(svc.ask('e1', 'u1', { text: 'Slides?' })).resolves.toEqual({ ok: true, status: 'APPROVED' });
    });

    it(`allows ${ASK_LIMIT.max} a minute, then 429`, async () => {
      const ok = build({ recent: ASK_LIMIT.max - 1 });
      await expect(ok.svc.ask('e1', 'u1', { text: 'One more?' })).resolves.toMatchObject({ ok: true });

      const { svc, prisma } = build({ recent: ASK_LIMIT.max });
      const err = await svc.ask('e1', 'u1', { text: 'Too many?' }).catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect(prisma.question.create).not.toHaveBeenCalled();
      // The window is per person per event.
      expect(prisma.question.count).toHaveBeenCalledWith({
        where: { eventId: 'e1', userId: 'u1', createdAt: { gte: expect.any(Date) } },
      });
    });

    it('refuses a session from another event', async () => {
      const { svc, prisma } = build();
      prisma.eventAgenda.count.mockResolvedValue(0);
      await expect(svc.ask('e1', 'u1', { text: 'Hi?', agendaId: 'a9' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses someone not attending', async () => {
      const { svc } = build({ attending: false, operator: true });
      await expect(svc.ask('e1', 'u1', { text: 'Hi?' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('moderation', () => {
    it('never moves anything back to PENDING, and hidden can’t jump to answered', () => {
      expect(Object.keys(MODERATION_FROM)).not.toContain('PENDING');
      expect(MODERATION_FROM.ANSWERED).not.toContain('HIDDEN');
      for (const [to, from] of Object.entries(MODERATION_FROM)) expect(from).not.toContain(to);
    });

    it('guards each move with the allowed from-statuses; hiding unpins, answering stamps', async () => {
      const { svc, prisma } = build();
      await svc.moderate('e1', 'q1', { status: 'HIDDEN' });
      expect(prisma.question.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'q1', eventId: 'e1', status: { in: ['PENDING', 'APPROVED', 'ANSWERED'] } },
        data: { status: 'HIDDEN', pinned: false },
      });
      await svc.moderate('e1', 'q1', { status: 'ANSWERED' });
      expect(prisma.question.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'q1', eventId: 'e1', status: { in: ['PENDING', 'APPROVED'] } },
        data: { status: 'ANSWERED', answeredAt: expect.any(Date) },
      });
    });

    it('rejects a move the row no longer allows', async () => {
      const { svc, prisma, gateway } = build();
      prisma.question.updateMany.mockResolvedValue({ count: 0 });
      prisma.question.count.mockResolvedValue(1);
      await expect(svc.moderate('e1', 'q1', { status: 'ANSWERED' })).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.engagementChanged).not.toHaveBeenCalled();
    });

    it('pins only visible questions; unpinning always works', async () => {
      const { svc, prisma } = build();
      await svc.moderate('e1', 'q1', { pinned: true });
      expect(prisma.question.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'q1', eventId: 'e1', status: { in: ['APPROVED', 'ANSWERED'] } },
        data: { pinned: true },
      });
      await svc.moderate('e1', 'q1', { pinned: false });
      expect(prisma.question.updateMany).toHaveBeenLastCalledWith({ where: { id: 'q1', eventId: 'e1' }, data: { pinned: false } });
    });
  });

  describe('visibility', () => {
    const row = (id: string, status: string, userId: string, votes = 0) => ({
      id,
      text: id,
      status,
      pinned: false,
      agendaId: null,
      agenda: null,
      userId,
      user: { fullName: `User ${userId}`, username: null },
      _count: { votes },
      answeredAt: null,
      createdAt: new Date(0),
    });

    it('attendees see public questions plus their own pending ones, never hidden', () => {
      expect(attendeeVisible('e1', 'u1')).toEqual({
        eventId: 'e1',
        OR: [{ status: { in: ['APPROVED', 'ANSWERED'] } }, { status: 'PENDING', userId: 'u1' }],
      });
    });

    it('the attendee feed is closed to outsiders and filters by visibility', async () => {
      const outsider = build({ attending: false, operator: false });
      await expect(outsider.svc.feed('e1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);

      const { svc, prisma } = build();
      prisma.question.findMany.mockResolvedValue([row('mine', 'PENDING', 'u1'), row('open', 'APPROVED', 'u2', 4)]);
      prisma.questionVote.findMany.mockResolvedValue([{ questionId: 'open' }]);
      const res = await svc.feed('e1', 'u1', 'a1');
      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ...attendeeVisible('e1', 'u1'), agendaId: 'a1' } }),
      );
      expect(res.questions.map((q) => [q.id, q.mine, q.voted, q.votes])).toEqual([
        ['open', false, true, 4],
        ['mine', true, false, 0],
      ]);
      // No author ids leak to attendees.
      expect(res.questions[0]).not.toHaveProperty('userId');
    });

    it('organisers see every status', async () => {
      const { svc, prisma } = build();
      await svc.listForManage('e1');
      expect(prisma.question.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: 'e1' } }));
    });

    it('ranks pinned first, answered last, then by votes and age', () => {
      const q = (id: string, votes: number, opts: { pinned?: boolean; status?: string; at?: number } = {}) => ({
        id,
        votes,
        pinned: !!opts.pinned,
        status: (opts.status ?? 'APPROVED') as never,
        createdAt: new Date(opts.at ?? 0),
      });
      const ranked = rankQuestions([
        q('answered', 99, { status: 'ANSWERED' }),
        q('low', 1),
        q('newTie', 5, { at: 2 }),
        q('oldTie', 5, { at: 1 }),
        q('pinned', 0, { pinned: true }),
      ]);
      expect(ranked.map((r) => r.id)).toEqual(['pinned', 'oldTie', 'newTie', 'low', 'answered']);
    });
  });
});
