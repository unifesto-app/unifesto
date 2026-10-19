import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PollsService, resultsVisible } from './polls.service';

// L1: vote once, status transitions, who may see the feed.
describe('PollsService', () => {
  const build = (opts: { attending?: boolean; operator?: boolean; poll?: object | null } = {}) => {
    const votes: { pollId: string; userId: string; optionIndex: number }[] = [];
    const prisma = {
      eventRegistration: { count: jest.fn().mockResolvedValue(opts.attending === false ? 0 : 1) },
      groupSeat: { count: jest.fn().mockResolvedValue(0) },
      poll: {
        findFirst: jest.fn().mockResolvedValue(
          opts.poll === undefined ? { status: 'LIVE', options: ['A', 'B'] } : opts.poll,
        ),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        deleteMany: jest.fn(),
      },
      pollVote: {
        // Stands in for the unique (poll_id, user_id) index.
        create: jest.fn(async ({ data }: { data: (typeof votes)[number] }) => {
          if (votes.some((v) => v.pollId === data.pollId && v.userId === data.userId)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          votes.push(data);
          return data;
        }),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const authz = { can: jest.fn().mockResolvedValue(!!opts.operator) };
    const gateway = { engagementChanged: jest.fn() };
    const svc = new PollsService(prisma as never, authz as never, gateway as never);
    return { svc, prisma, gateway, votes };
  };

  describe('vote', () => {
    it('counts one vote per person; the second is a conflict', async () => {
      const { svc, votes, gateway } = build();
      await svc.vote('e1', 'p1', 'u1', 1);
      await expect(svc.vote('e1', 'p1', 'u1', 0)).rejects.toBeInstanceOf(ConflictException);
      expect(votes).toEqual([{ pollId: 'p1', userId: 'u1', optionIndex: 1 }]);
      expect(gateway.engagementChanged).toHaveBeenCalledTimes(1);
    });

    it('lets different people vote on the same poll', async () => {
      const { svc, votes } = build();
      await svc.vote('e1', 'p1', 'u1', 0);
      await svc.vote('e1', 'p1', 'u2', 0);
      expect(votes).toHaveLength(2);
    });

    it('refuses someone not attending, even an operator', async () => {
      const { svc, votes } = build({ attending: false, operator: true });
      await expect(svc.vote('e1', 'p1', 'u1', 0)).rejects.toBeInstanceOf(ForbiddenException);
      expect(votes).toHaveLength(0);
    });

    it.each(['DRAFT', 'CLOSED'])('refuses a %s poll', async (status) => {
      const { svc } = build({ poll: { status, options: ['A', 'B'] } });
      await expect(svc.vote('e1', 'p1', 'u1', 0)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an option past the end', async () => {
      const { svc } = build();
      await expect(svc.vote('e1', 'p1', 'u1', 2)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('status transitions', () => {
    it('launches only from DRAFT and closes only from LIVE', async () => {
      const { svc, prisma, gateway } = build();
      prisma.poll.updateMany.mockResolvedValue({ count: 1 });
      await svc.launch('e1', 'p1');
      expect(prisma.poll.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'p1', eventId: 'e1', status: 'DRAFT' },
        data: expect.objectContaining({ status: 'LIVE' }),
      });
      await svc.close('e1', 'p1');
      expect(prisma.poll.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'p1', eventId: 'e1', status: 'LIVE' },
        data: expect.objectContaining({ status: 'CLOSED' }),
      });
      expect(gateway.engagementChanged).toHaveBeenCalledTimes(2);
    });

    it('rejects a second launch (the row is no longer DRAFT)', async () => {
      const { svc, prisma, gateway } = build();
      prisma.poll.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.launch('e1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.close('e1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.engagementChanged).not.toHaveBeenCalled();
    });

    it('never deletes a live poll', async () => {
      const { svc, prisma } = build();
      prisma.poll.deleteMany.mockResolvedValue({ count: 0 });
      await expect(svc.remove('e1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.poll.deleteMany).toHaveBeenCalledWith({
        where: { id: 'p1', eventId: 'e1', status: { not: 'LIVE' } },
      });
    });
  });

  describe('feed', () => {
    it('is closed to people who neither attend nor operate the event', async () => {
      const { svc } = build({ attending: false, operator: false });
      await expect(svc.feed('e1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('hides counts until the attendee votes, then shows them', async () => {
      const { svc, prisma } = build();
      const poll = { id: 'p1', status: 'LIVE', resultsVisibility: 'AFTER_VOTE', options: ['A', 'B'] };
      prisma.poll.findMany.mockResolvedValue([poll]);
      prisma.pollVote.groupBy.mockResolvedValue([{ pollId: 'p1', optionIndex: 1, _count: { _all: 3 } }]);

      const before = await svc.feed('e1', 'u1');
      expect(before.polls[0]).toMatchObject({ results: null, myVote: null });

      prisma.pollVote.findMany.mockResolvedValue([{ pollId: 'p1', optionIndex: 1 }]);
      const after = await svc.feed('e1', 'u1');
      expect(after.polls[0]).toMatchObject({ results: [0, 3], totalVotes: 3, myVote: 1 });
    });
  });

  it('resultsVisible follows the poll setting', () => {
    const p = (status: string, resultsVisibility: string) => ({ status, resultsVisibility }) as never;
    expect(resultsVisible(p('LIVE', 'AFTER_VOTE'), false)).toBe(false);
    expect(resultsVisible(p('LIVE', 'AFTER_VOTE'), true)).toBe(true);
    expect(resultsVisible(p('LIVE', 'AFTER_CLOSE'), true)).toBe(false);
    expect(resultsVisible(p('CLOSED', 'AFTER_CLOSE'), false)).toBe(true);
    expect(resultsVisible(p('CLOSED', 'ORGANISERS_ONLY'), true)).toBe(false);
  });
});
