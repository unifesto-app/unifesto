import { ForbiddenException } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

/**
 * Unit tests for the privacy-critical service rules. Prisma, the authorization
 * service, plan config and the gateway are all faked so these stay about POLICY:
 *   - round-close read-lock (panelists cannot read once a round is CLOSED),
 *   - mentors may never submit numeric scores,
 *   - the participant view never touches score tables and hides feedback until
 *     the curator reveals it.
 */
describe('LeaderboardService (privacy rules)', () => {
  const EVENT = 'event-1';
  const BOARD = 'board-1';
  const ENTRANT = 'entrant-1';
  const ROUND = 'round-1';
  const JUDGE = 'judge-1';
  const MENTOR = 'mentor-1';

  /** Build a service with a hand-faked Prisma; overrides merge onto the base. */
  const build = (prismaOverrides: Record<string, any> = {}) => {
    const prisma: any = {
      leaderboardEntrant: {
        findUnique: jest.fn().mockResolvedValue({
          id: ENTRANT,
          leaderboard: { id: BOARD, eventId: EVENT, mode: 'RUBRIC', metrics: [] },
        }),
      },
      leaderboardRound: {
        findFirst: jest.fn().mockResolvedValue({
          id: ROUND,
          leaderboardId: BOARD,
          status: 'ACTIVE',
        }),
      },
      leaderboardPanelist: { findMany: jest.fn().mockResolvedValue([]) },
      leaderboardScore: { findMany: jest.fn().mockResolvedValue([]) },
      leaderboardJudgment: { findFirst: jest.fn().mockResolvedValue(null) },
      groupSeat: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation(async (arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
      ...prismaOverrides,
    };
    const authz = { assertCan: jest.fn(), can: jest.fn().mockResolvedValue(false) };
    const planConfig = { getEffectiveLimits: jest.fn() };
    const gateway = { broadcast: jest.fn() };
    const svc = new LeaderboardService(
      prisma as any,
      planConfig as any,
      authz as any,
      gateway as any,
      { emit: jest.fn() } as any,
    );
    return { svc, prisma, authz };
  };

  it('MENTOR-NO-SCORE: a mentor submitting scores is rejected', async () => {
    const { svc } = build({
      leaderboardPanelist: {
        findMany: jest.fn().mockResolvedValue([
          { kind: 'MENTOR', roundId: null, entrantId: null },
        ]),
      },
    });
    await expect(
      svc.submitJudgment(MENTOR, ENTRANT, {
        roundId: ROUND,
        scores: [{ metricId: 'm1', value: 5 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('MENTOR: a review-only submission is accepted', async () => {
    const upsertScore = jest.fn();
    const upsertJudgment = jest.fn().mockResolvedValue({});
    const { svc } = build({
      leaderboardPanelist: {
        findMany: jest.fn().mockResolvedValue([
          { kind: 'MENTOR', roundId: null, entrantId: null },
        ]),
      },
      leaderboardScore: { upsert: upsertScore, findMany: jest.fn().mockResolvedValue([]) },
      leaderboardJudgment: { upsert: upsertJudgment, findFirst: jest.fn() },
      leaderboard: { findUnique: jest.fn().mockResolvedValue(null) }, // skip recompute
    });
    await expect(
      svc.submitJudgment(MENTOR, ENTRANT, { roundId: ROUND, overallReview: 'nice work', submit: true }),
    ).resolves.toEqual({ ok: true });
    expect(upsertScore).not.toHaveBeenCalled(); // mentors never write score cells
    expect(upsertJudgment).toHaveBeenCalledTimes(1);
  });

  it('ROUND-CLOSED WRITE-LOCK: submitting to a CLOSED round is rejected', async () => {
    const { svc } = build({
      leaderboardRound: {
        findFirst: jest.fn().mockResolvedValue({ id: ROUND, leaderboardId: BOARD, status: 'CLOSED' }),
      },
      leaderboardPanelist: {
        findMany: jest.fn().mockResolvedValue([{ kind: 'JUDGE', roundId: null, entrantId: null }]),
      },
    });
    await expect(
      svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, overallReview: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('HACKATHON GATE: a team is judged only after it locks its problem statement', () => {
    const judge = { findMany: jest.fn().mockResolvedValue([{ kind: 'JUDGE', roundId: null, entrantId: null }]) };
    const hackTeam = (over: Record<string, unknown>) => ({
      findUnique: jest.fn().mockResolvedValue({
        id: ENTRANT,
        cancelledAt: null,
        statementLockedAt: null,
        leaderboard: { id: BOARD, eventId: EVENT, mode: 'RUBRIC', metrics: [], isHackathon: true, enabled: true },
        ...over,
      }),
    });

    it('rejects a team still choosing its statement', async () => {
      const upsert = jest.fn();
      const { svc } = build({
        leaderboardEntrant: hackTeam({}),
        leaderboardPanelist: judge,
        leaderboardJudgment: { upsert, findFirst: jest.fn() },
      });
      await expect(svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, overallReview: 'x' })).rejects.toThrow(
        /problem statement/,
      );
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects a cancelled team even with a locked statement', async () => {
      const { svc } = build({
        leaderboardEntrant: hackTeam({ cancelledAt: new Date(), statementLockedAt: new Date() }),
        leaderboardPanelist: judge,
      });
      await expect(svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, overallReview: 'x' })).rejects.toThrow(
        /cancelled/,
      );
    });

    it('accepts a team with a locked statement', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      const { svc } = build({
        leaderboardEntrant: hackTeam({ statementLockedAt: new Date() }),
        leaderboardPanelist: judge,
        leaderboardJudgment: { upsert, findFirst: jest.fn() },
        leaderboard: { findUnique: jest.fn().mockResolvedValue(null) }, // skip recompute
      });
      await expect(svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, overallReview: 'x' })).resolves.toEqual({
        ok: true,
      });
      expect(upsert).toHaveBeenCalledTimes(1);
    });
  });

  it('ROUND-CLOSED READ-LOCK: reading own judgment on a CLOSED round is rejected', async () => {
    const { svc } = build({
      leaderboardRound: {
        findFirst: jest.fn().mockResolvedValue({ id: ROUND, leaderboardId: BOARD, status: 'CLOSED' }),
      },
      leaderboardPanelist: {
        findMany: jest.fn().mockResolvedValue([{ kind: 'JUDGE', roundId: null, entrantId: null }]),
      },
    });
    await expect(svc.getMyJudgment(JUDGE, ENTRANT, ROUND)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('NON-PANELIST: a stranger cannot read a judgment', async () => {
    const { svc } = build({
      leaderboardPanelist: { findMany: jest.fn().mockResolvedValue([]) }, // no assignment
    });
    await expect(svc.getMyJudgment('stranger', ENTRANT, ROUND)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  describe('PARTICIPANT VIEW never leaks marks', () => {
    const baseBoard = (revealReviews: boolean) => ({
      id: BOARD,
      eventId: EVENT,
      enabled: true,
      title: 'Hackathon',
      mode: 'RUBRIC',
      revealReviews,
      rounds: [{ id: ROUND, name: 'Finals', order: 1, status: 'ACTIVE' }],
      entrants: [
        { id: ENTRANT, name: 'My Team', userId: 'me', registrationId: null },
        { id: 'other', name: 'Rivals', userId: 'them', registrationId: null },
      ],
    });

    const buildParticipant = (
      revealReviews: boolean,
      judgmentFindMany = jest.fn().mockResolvedValue([]),
    ) => {
      const scoreFindMany = jest.fn();
      return {
        ...build({
          leaderboard: { findUnique: jest.fn().mockResolvedValue(baseBoard(revealReviews)) },
          eventRegistration: { findMany: jest.fn().mockResolvedValue([]) },
          leaderboardEntrantRound: {
            findMany: jest.fn().mockResolvedValue([
              { entrantId: ENTRANT, roundId: ROUND, status: 'ADVANCED' },
              { entrantId: 'other', roundId: ROUND, status: 'ELIMINATED' },
            ]),
          },
          leaderboardAward: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'a1', title: 'Winner', entrantId: ENTRANT },
            ]),
          },
          leaderboardScore: { findMany: scoreFindMany },
          leaderboardJudgment: { findMany: judgmentFindMany },
        }),
        scoreFindMany,
      };
    };

    it('reads the bracket from entrant-rounds and never queries the score table', async () => {
      const { svc, scoreFindMany } = buildParticipant(false);
      const view = await svc.getParticipantView(EVENT, 'me');
      expect(scoreFindMany).not.toHaveBeenCalled();
      const round = view!.rounds[0];
      expect(round.entrants.find((e) => e.id === ENTRANT)!.status).toBe('ADVANCED');
      expect(round.entrants.find((e) => e.id === 'other')!.status).toBe('ELIMINATED');
      // No numeric field of any kind is exposed on a participant entrant row.
      expect(round.entrants[0]).not.toHaveProperty('roundScore');
      expect(round.entrants[0]).not.toHaveProperty('rank');
    });

    it('hides written feedback until the curator reveals it', async () => {
      const judgmentFindMany = jest.fn();
      const { svc } = buildParticipant(false, judgmentFindMany);
      const view = await svc.getParticipantView(EVENT, 'me');
      expect(view!.feedback).toEqual([]);
      expect(judgmentFindMany).not.toHaveBeenCalled(); // not even queried when hidden
    });

    it('exposes only OWN overall reviews once revealed (no per-cell marks)', async () => {
      const judgmentFindMany = jest
        .fn()
        .mockResolvedValue([{ roundId: ROUND, entrantId: ENTRANT, overallReview: 'great pitch' }]);
      const { svc } = buildParticipant(true, judgmentFindMany);
      const view = await svc.getParticipantView(EVENT, 'me');
      expect(view!.feedback).toEqual([
        { roundId: ROUND, entrantId: ENTRANT, overallReview: 'great pitch' },
      ]);
      // The query was scoped to submitted reviews with non-null text only.
      const where = judgmentFindMany.mock.calls[0][0].where;
      expect(where.submittedAt).toEqual({ not: null });
      expect(where.overallReview).toEqual({ not: null });
    });
  });
});
