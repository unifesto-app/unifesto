import { HackathonRoundsService } from './hackathon-rounds.service';
import { HackathonResultsService } from './hackathon-results.service';

/**
 * E8 with a hand-faked Prisma: criteria lock once a round is marked, the
 * "top N" helper never overrides a curator's decision or runs on an open
 * round, and unpublishing an award stops its certificates verifying.
 */
describe('Hackathon rounds and results (E8)', () => {
  const EVENT = 'event-1';
  const BOARD = 'board-1';
  const ROUND = 'round-1';
  const CURATOR = 'curator-1';
  const METRIC = { id: 'm1', label: 'Innovation', roundId: ROUND, maxValue: 10, weight: 1 };

  const build = (opts: { marked?: boolean; round?: Record<string, unknown> } = {}) => {
    const prisma: any = {
      leaderboardRound: { findFirst: jest.fn().mockResolvedValue({ id: ROUND, name: 'Round 1', status: 'CLOSED', eliminationEnabled: true, ...opts.round }) },
      leaderboardMetric: { findFirst: jest.fn().mockResolvedValue(METRIC), update: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      leaderboardScore: { findFirst: jest.fn().mockResolvedValue(opts.marked ? { id: 's1' } : null) },
      leaderboardEntrantRound: { upsert: jest.fn() },
      hackathonEvalRequest: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      leaderboardAward: { update: jest.fn() },
      certificate: { updateMany: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };
    const leaderboard: any = { assertCanManage: jest.fn(), assertCanDeclareWinners: jest.fn(), recomputeAndBroadcast: jest.fn(), notifyTeams: jest.fn() };
    const teams: any = { getBoardOrThrow: jest.fn().mockResolvedValue({ id: BOARD, eventId: EVENT, enabled: true }), syncCancellations: jest.fn() };
    const gateway: any = { hackathonChanged: jest.fn() };
    const rounds = new HackathonRoundsService(prisma, leaderboard, teams, {} as any, gateway);
    jest.spyOn(rounds, 'getRound').mockResolvedValue({} as any);
    const results = new HackathonResultsService(prisma, leaderboard, teams, {} as any, gateway);
    jest.spyOn(results, 'listAwards').mockResolvedValue({} as any);
    return { rounds, results, prisma };
  };

  describe('criteria', () => {
    it('can change top mark and weight before any mark', async () => {
      const { rounds, prisma } = build();
      await rounds.upsertCriterion(CURATOR, EVENT, ROUND, 'm1', { label: 'Innovation', maxValue: 20, weight: 2 });
      expect(prisma.leaderboardMetric.update).toHaveBeenCalled();
    });

    it('locks top mark and weight once the round is marked', async () => {
      const { rounds, prisma } = build({ marked: true });
      await expect(rounds.upsertCriterion(CURATOR, EVENT, ROUND, 'm1', { label: 'Innovation', maxValue: 20 })).rejects.toThrow(/locked/);
      await expect(rounds.upsertCriterion(CURATOR, EVENT, ROUND, 'm1', { label: 'Innovation', maxValue: 10, weight: 3 })).rejects.toThrow(/locked/);
      expect(prisma.leaderboardMetric.update).not.toHaveBeenCalled();
    });

    it('still allows a rename once marked', async () => {
      const { rounds, prisma } = build({ marked: true });
      await rounds.upsertCriterion(CURATOR, EVENT, ROUND, 'm1', { label: 'Originality', maxValue: 10, weight: 1 });
      expect(prisma.leaderboardMetric.update.mock.calls[0][0].data.label).toBe('Originality');
    });

    it('no new criterion and no delete once marked', async () => {
      const { rounds, prisma } = build({ marked: true });
      prisma.leaderboardMetric.findFirst.mockResolvedValue({ ...METRIC, _count: { scores: 0 } });
      await expect(rounds.upsertCriterion(CURATOR, EVENT, ROUND, null, { label: 'Pitch', maxValue: 10 })).rejects.toThrow(/no criteria can be added/);
      await expect(rounds.deleteCriterion(CURATOR, EVENT, ROUND, 'm1')).rejects.toThrow(/stays/);
      expect(prisma.leaderboardMetric.create).not.toHaveBeenCalled();
      expect(prisma.leaderboardMetric.delete).not.toHaveBeenCalled();
    });
  });

  describe('top N', () => {
    const ctx = (standing: Record<string, string>) => ({
      rounds: [],
      teams: [],
      standing: (id: string) => standing[id] ?? 'PENDING',
    });
    const decisions = {
      decisions: [
        { entrantId: 'a', status: 'ADVANCED' as const },
        { entrantId: 'b', status: 'ELIMINATED' as const },
      ],
    };

    it('refuses while the round is open', async () => {
      const { rounds, prisma } = build({ round: { status: 'ACTIVE' } });
      jest.spyOn(rounds, 'context').mockResolvedValue(ctx({}) as any);
      jest.spyOn(rounds, 'teamsInRound').mockReturnValue([{ id: 'a' }, { id: 'b' }] as any);
      await expect(rounds.setDecisions(CURATOR, EVENT, ROUND, decisions)).rejects.toThrow(/Close Round 1/);
      expect(prisma.leaderboardEntrantRound.upsert).not.toHaveBeenCalled();
    });

    it('never overrides a team the curator already decided', async () => {
      const { rounds, prisma } = build();
      jest.spyOn(rounds, 'context').mockResolvedValue(ctx({ b: 'ADVANCED' }) as any);
      jest.spyOn(rounds, 'teamsInRound').mockReturnValue([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] as any);
      await rounds.setDecisions(CURATOR, EVENT, ROUND, decisions);
      const written = prisma.leaderboardEntrantRound.upsert.mock.calls.map((c: any[]) => c[0].where.entrantId_roundId.entrantId);
      expect(written).toEqual(['a']);
    });
  });

  it('unpublishing an award revokes its winner certificates', async () => {
    const { results, prisma } = build();
    jest.spyOn(results as any, 'findAwardOrThrow').mockResolvedValue({ id: 'award-1', published: true });
    await results.unpublishAward(CURATOR, EVENT, 'award-1');
    expect(prisma.certificate.updateMany).toHaveBeenCalledWith({
      where: { awardId: 'award-1', status: 'ISSUED' },
      data: expect.objectContaining({ status: 'REVOKED', revokedForCause: false }),
    });
  });
});
