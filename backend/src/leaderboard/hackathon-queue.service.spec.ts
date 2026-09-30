import { BadRequestException, ConflictException } from '@nestjs/common';
import { HackathonQueueService } from './hackathon-queue.service';

/**
 * The evaluation queue with a hand-faked Prisma: a judge can't call the next
 * team while marks for the last one are due, and a no-show waits for the grace time.
 */
describe('HackathonQueueService', () => {
  const EVENT = 'event-1';
  const BOARD = 'board-1';
  const JUDGE = 'judge-1';

  const build = () => {
    const prisma: any = {
      leaderboardPanelist: { count: jest.fn().mockResolvedValue(1) },
      hackathonJudgeProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 'profile-1', isAvailable: true, location: 'Lab 2', meetingUrl: null }),
      },
      hackathonEvalRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Asha' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
    };
    const teams = {
      getBoardOrThrow: jest.fn().mockResolvedValue({ id: BOARD, eventId: EVENT, enabled: true }),
      notify: jest.fn(),
    };
    const rounds = { findRoundOrThrow: jest.fn().mockResolvedValue({ id: 'round-1', name: 'Round 1', callGraceMinutes: 3, slotMinutes: 10 }) };
    const svc = new HackathonQueueService(
      prisma,
      { assertCanManage: jest.fn() } as any,
      teams as any,
      { notifyJudges: jest.fn() } as any,
      rounds as any,
      { hackathonChanged: jest.fn() } as any,
    );
    return { svc, prisma, teams };
  };

  it('Call next is blocked until marks for the last team are in', async () => {
    const { svc, prisma } = build();
    prisma.hackathonEvalRequest.findFirst
      .mockResolvedValueOnce(null) // who is first in line (before)
      .mockResolvedValueOnce({ status: 'AWAITING_MARKS', entrant: { teamCode: 'H-001', name: 'Byte Me' } }); // busy check
    const call = svc.callNext(JUDGE, EVENT, {});
    await expect(call).rejects.toBeInstanceOf(ConflictException);
    await expect(call).rejects.toThrow(/Submit marks for H-001/);
    expect(prisma.hackathonEvalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('a judge on a break can’t call teams', async () => {
    const { svc, prisma } = build();
    prisma.hackathonJudgeProfile.upsert.mockResolvedValue({ id: 'profile-1', isAvailable: false, location: null, meetingUrl: null });
    await expect(svc.callNext(JUDGE, EVENT, {})).rejects.toThrow(/break/);
  });

  it('a no-show waits for the grace time after the call', async () => {
    const { svc, prisma } = build();
    prisma.hackathonEvalRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      leaderboardId: BOARD,
      roundId: 'round-1',
      entrantId: 'team-1',
      judgeUserId: JUDGE,
      panelId: null,
      status: 'CALLED',
      calledAt: new Date(Date.now() - 60_000),
    });
    await expect(svc.noShow(JUDGE, EVENT, 'req-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hackathonEvalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('only a called team can be a no-show', async () => {
    const { svc, prisma } = build();
    prisma.hackathonEvalRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      leaderboardId: BOARD,
      roundId: 'round-1',
      entrantId: 'team-1',
      judgeUserId: JUDGE,
      panelId: null,
      status: 'IN_PROGRESS',
      calledAt: new Date(Date.now() - 10 * 60_000),
    });
    await expect(svc.noShow(JUDGE, EVENT, 'req-1')).rejects.toThrow(/called team/);
  });
});
