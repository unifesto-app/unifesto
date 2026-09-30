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
    const gateway = { broadcast: jest.fn(), hackathonChanged: jest.fn() };
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
    const judge = {
      findMany: jest.fn().mockResolvedValue([{ kind: 'JUDGE', roundId: null, entrantId: null }]),
      count: jest.fn().mockResolvedValue(1), // a judge row covers this round
    };
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

    it('accepts a team with a locked statement during its slot', async () => {
      const upsert = jest.fn().mockResolvedValue({ submittedAt: null, reopenedAt: null, requestId: 'req-1' });
      const { svc } = build({
        leaderboardEntrant: hackTeam({ statementLockedAt: new Date() }),
        leaderboardPanelist: judge,
        leaderboardJudgment: { upsert, findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
        hackathonEvalRequest: { findFirst: jest.fn().mockResolvedValue({ id: 'req-1', panelId: null }), count: jest.fn() },
        leaderboard: { findUnique: jest.fn().mockResolvedValue(null) }, // skip recompute
      });
      await expect(svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, overallReview: 'x' })).resolves.toMatchObject({
        ok: true,
        slotCompleted: false,
      });
      expect(upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('HACKATHON MARKS: during the slot, then 5 minutes to change them', () => {
    const judge = {
      findMany: jest.fn().mockResolvedValue([{ kind: 'JUDGE', roundId: null, entrantId: null }]),
      count: jest.fn().mockResolvedValue(1), // a judge row covers this round
    };
    const METRIC = { id: 'm1', label: 'Innovation', roundId: ROUND, minValue: 0, maxValue: 10 };
    const hackTeam = () => ({
      findUnique: jest.fn().mockResolvedValue({
        id: ENTRANT,
        leaderboardId: BOARD,
        cancelledAt: null,
        statementLockedAt: new Date(),
        leaderboard: { id: BOARD, eventId: EVENT, mode: 'RUBRIC', metrics: [METRIC], isHackathon: true, enabled: true },
      }),
    });
    const base = (over: Record<string, any>) => ({
      leaderboardEntrant: hackTeam(),
      leaderboardPanelist: judge,
      leaderboardScore: { upsert: jest.fn(), findMany: jest.fn() },
      leaderboard: { findUnique: jest.fn().mockResolvedValue(null) },
      ...over,
    });

    it('refuses marks when the judge has no running slot with the team', async () => {
      const upsert = jest.fn();
      const { svc } = build(
        base({
          leaderboardJudgment: { upsert, findUnique: jest.fn().mockResolvedValue(null) },
          hackathonEvalRequest: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
        }),
      );
      await expect(
        svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, scores: [{ metricId: 'm1', value: 5 }] }),
      ).rejects.toThrow(/slot/);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('refuses to submit until every criterion has a mark', async () => {
      const { svc } = build(base({ leaderboardJudgment: { upsert: jest.fn(), findUnique: jest.fn() } }));
      await expect(svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, submit: true })).rejects.toThrow(/Innovation/);
    });

    it('first submit stamps submittedAt and completes the slot', async () => {
      const upsert = jest.fn().mockResolvedValue({ submittedAt: new Date(), reopenedAt: null, requestId: 'req-1' });
      const complete = jest.fn().mockResolvedValue({ count: 1 });
      const { svc } = build(
        base({
          leaderboardJudgment: { upsert, findUnique: jest.fn().mockResolvedValue(null) },
          hackathonEvalRequest: {
            findFirst: jest.fn().mockResolvedValue({ id: 'req-1', panelId: null }),
            count: jest.fn(),
            updateMany: complete,
          },
        }),
      );
      await expect(
        svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, scores: [{ metricId: 'm1', value: 7 }], submit: true }),
      ).resolves.toMatchObject({ ok: true, slotCompleted: true });
      expect(upsert.mock.calls[0][0].create.submittedAt).toBeInstanceOf(Date);
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'req-1' }), data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });

    it('an edit within 5 minutes keeps the first submit time', async () => {
      const first = new Date(Date.now() - 2 * 60_000);
      const upsert = jest.fn().mockResolvedValue({ submittedAt: first, reopenedAt: null, requestId: 'req-1' });
      const { svc } = build(
        base({
          leaderboardJudgment: {
            upsert,
            findUnique: jest.fn().mockResolvedValue({ submittedAt: first, reopenedAt: null, requestId: 'req-1' }),
          },
        }),
      );
      await svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, scores: [{ metricId: 'm1', value: 8 }], submit: true });
      expect(upsert.mock.calls[0][0].update.submittedAt).toBeUndefined();
    });

    it('locks marks 5 minutes after submit (JUDGMENT_LOCKED)', async () => {
      const first = new Date(Date.now() - 6 * 60_000);
      const upsert = jest.fn();
      const { svc } = build(
        base({
          leaderboardJudgment: {
            upsert,
            findUnique: jest.fn().mockResolvedValue({ submittedAt: first, reopenedAt: null, requestId: 'req-1' }),
          },
        }),
      );
      await expect(
        svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, scores: [{ metricId: 'm1', value: 9 }], submit: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('a curator reopen gives another 5 minutes', async () => {
      const first = new Date(Date.now() - 20 * 60_000);
      const reopened = new Date(Date.now() - 60_000);
      const upsert = jest.fn().mockResolvedValue({ submittedAt: first, reopenedAt: reopened, requestId: 'req-1' });
      const { svc } = build(
        base({
          leaderboardJudgment: {
            upsert,
            findUnique: jest.fn().mockResolvedValue({ submittedAt: first, reopenedAt: reopened, requestId: 'req-1' }),
          },
        }),
      );
      await expect(
        svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, scores: [{ metricId: 'm1', value: 9 }], submit: true }),
      ).resolves.toMatchObject({ ok: true });
    });

    it('a PANEL slot completes only when every member has submitted', async () => {
      const upsert = jest.fn().mockResolvedValue({ submittedAt: new Date(), reopenedAt: null, requestId: 'req-1' });
      const complete = jest.fn();
      const { svc } = build(
        base({
          leaderboardJudgment: { upsert, findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(1) },
          hackathonEvalRequest: {
            findFirst: jest.fn().mockResolvedValue({ id: 'req-1', panelId: 'panel-1' }),
            count: jest.fn(),
            updateMany: complete,
          },
          hackathonPanelMember: { findMany: jest.fn().mockResolvedValue([{ userId: JUDGE }, { userId: 'judge-2' }]) },
        }),
      );
      await expect(
        svc.submitJudgment(JUDGE, ENTRANT, { roundId: ROUND, scores: [{ metricId: 'm1', value: 6 }], submit: true }),
      ).resolves.toMatchObject({ slotCompleted: false });
      expect(complete).not.toHaveBeenCalled();
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
