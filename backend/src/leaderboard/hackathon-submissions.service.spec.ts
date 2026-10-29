import { BadRequestException } from '@nestjs/common';
import { HackathonSubmissionsService } from './hackathon-submissions.service';

/** E5: links lock once a judge has scored them, and curators see every team's links per round. */
describe('HackathonSubmissionsService', () => {
  const round = { id: 'r1', name: 'Round 1', kind: 'EVALUATION', order: 1, status: 'ACTIVE', submissionsCloseAt: null, eliminationEnabled: false };
  const team = { id: 't1', teamCode: 'T-01', name: 'Bytes', cancelledAt: null, statementLockedAt: new Date('2026-11-01') };
  const other = { id: 't2', teamCode: 'T-02', name: 'Nulls' };

  const setup = (judged: { entrantId: string; roundId: string }[] = []) => {
    const prisma: any = {
      leaderboardJudgment: {
        findMany: jest.fn(async ({ where }: any) =>
          judged.filter((j) => where.entrantId.in.includes(j.entrantId) && (!where.roundId || where.roundId === j.roundId)),
        ),
      },
      hackathonSubmission: {
        findMany: jest.fn(async () => [
          { entrantId: 't1', roundId: 'r1', links: [{ label: 'Repo', url: 'https://git.example/bytes' }], notes: null, updatedAt: new Date(), submittedBy: 'u1' },
        ]),
        upsert: jest.fn(),
      },
      user: { findMany: jest.fn(async () => [{ id: 'u1', fullName: 'Ana', username: 'ana' }]) },
    };
    const leaderboard: any = { assertCanManage: jest.fn() };
    const teams: any = {
      getBoardOrThrow: jest.fn(async () => ({ id: 'b1', enabled: true })),
      findMyTeam: jest.fn(async () => team),
    };
    const ctx = { rounds: [round], teams: [team, other], standing: () => 'PENDING' };
    const rounds: any = {
      findRoundOrThrow: jest.fn(async () => round),
      context: jest.fn(async () => ctx),
      teamsInRound: jest.fn(() => [team, other]),
    };
    return { prisma, leaderboard, svc: new HackathonSubmissionsService(prisma, leaderboard, teams, rounds) };
  };

  it('a team edits its links until a judge has scored them', async () => {
    const open = setup();
    const mine = await open.svc.getMine('u1', 'ev-1');
    expect(mine.rounds[0]).toMatchObject({ canEdit: true, locked: false });

    const scored = setup([{ entrantId: 't1', roundId: 'r1' }]);
    expect((await scored.svc.getMine('u1', 'ev-1')).rounds[0]).toMatchObject({ canEdit: false, locked: true });
    await expect(scored.svc.saveMine('u1', 'ev-1', 'r1', { links: [{ url: 'https://new.example' }] } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(scored.prisma.hackathonSubmission.upsert).not.toHaveBeenCalled();
  });

  it("curators see every team's links in the round, with missing and judged", async () => {
    const { svc, leaderboard } = setup([{ entrantId: 't1', roundId: 'r1' }]);
    const res = await svc.listForRound('cur', 'ev-1', 'r1');
    expect(leaderboard.assertCanManage).toHaveBeenCalledWith('cur', 'ev-1');
    expect(res.teams).toEqual([
      expect.objectContaining({ teamId: 't1', missing: false, judged: true, updatedBy: 'Ana' }),
      expect.objectContaining({ teamId: 't2', missing: true, judged: false, links: [] }),
    ]);
  });
});
