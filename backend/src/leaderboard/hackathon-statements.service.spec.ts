import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonStatementsService } from './hackathon-statements.service';

/**
 * Problem statements with a hand-faked Prisma: who may lock one in and when,
 * the one-lock-only guard, statement places, the curator's override, and the
 * "changed after evaluation" flag.
 */
describe('HackathonStatementsService', () => {
  const EVENT = 'event-1';
  const BOARD = 'board-1';
  const CURATOR = 'curator-1';
  const LEAD = 'lead-1';
  const MEMBER = 'member-1';
  const TEAM = 'team-a';
  const PS = 'ps-1';

  const board = (over: Record<string, unknown> = {}) => ({
    id: BOARD,
    eventId: EVENT,
    isHackathon: true,
    enabled: true,
    teamCodePrefix: 'H-',
    teamCodeDigits: 3,
    teamCodeNext: 2,
    teamNameFieldId: null,
    venueName: null,
    venueAddress: null,
    venueLat: null,
    venueLng: null,
    venueMapUrl: null,
    venueNotes: null,
    psMode: 'TEAM_PICKS',
    themeMode: 'LIST',
    psDeadline: null,
    ...over,
  });

  const team = (over: Record<string, unknown> = {}) => ({
    id: TEAM,
    teamCode: 'H-001',
    name: 'Null Pointers',
    teamNameSource: 'LEAD',
    cancelledAt: null,
    registrationId: 'reg-a',
    room: null,
    statementId: null,
    statement: null,
    customStatementTitle: null,
    customStatementText: null,
    themeId: null,
    theme: null,
    themeText: null,
    statementLockedAt: null,
    statementSetBy: null,
    statementChangedAfterEvalAt: null,
    ...over,
  });

  /** The team's statement columns as they were before the write. */
  const before = (over: Record<string, unknown> = {}) => ({
    statementId: null,
    customStatementTitle: null,
    customStatementText: null,
    themeId: null,
    themeText: null,
    statementLockedAt: null,
    ...over,
  });

  const build = (opts: { board?: Record<string, unknown>; team?: Record<string, unknown> } = {}) => {
    const prisma: any = {
      leaderboard: { findUnique: jest.fn().mockResolvedValue(board(opts.board)) },
      leaderboardEntrant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(before()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      hackathonTheme: { findMany: jest.fn().mockResolvedValue([]) },
      hackathonStatement: {
        findFirst: jest.fn().mockResolvedValue({ id: PS, code: 'PS-01', title: 'Clean water', themeId: null, maxTeams: null }),
        delete: jest.fn(),
      },
      leaderboardJudgment: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockImplementation(async (arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };
    const leaderboard: any = { assertCanManage: jest.fn().mockResolvedValue(undefined) };
    const teams = new HackathonTeamsService(prisma, leaderboard, { emit: jest.fn() } as any);
    jest.spyOn(teams, 'syncCancellations').mockResolvedValue(undefined);
    jest.spyOn(teams, 'findMyTeam').mockResolvedValue(team(opts.team) as any);
    jest.spyOn(teams, 'findTeamOrThrow').mockResolvedValue(team(opts.team) as any);
    jest.spyOn(teams, 'leadUserId').mockResolvedValue(LEAD);
    jest.spyOn(teams, 'getMyHub').mockResolvedValue({} as any);
    jest.spyOn(teams, 'getTeam').mockResolvedValue({} as any);
    const notify = jest.spyOn(teams, 'notify').mockResolvedValue(undefined);
    const svc = new HackathonStatementsService(prisma, leaderboard, teams);
    return { svc, prisma, leaderboard, notify };
  };

  describe('the team lead locks in', () => {
    it('picks from the list: locks it once and tells the rest of the team', async () => {
      const { svc, prisma, notify } = build();
      await svc.lockMyStatement(LEAD, EVENT, { statementId: PS });

      const write = prisma.leaderboardEntrant.updateMany.mock.calls[0][0];
      // Only an unlocked team can be written: a double tap can't lock twice.
      expect(write.where).toEqual({ id: TEAM, statementLockedAt: null });
      expect(write.data).toMatchObject({
        statementId: PS,
        customStatementTitle: null,
        statementLockedAt: expect.any(Date),
        statementSetBy: LEAD,
      });
      expect(notify).toHaveBeenCalledWith(EVENT, [expect.objectContaining({ id: TEAM })], 'STATEMENT_LOCKED', {
        statementTitle: 'Clean water',
        exceptUserId: LEAD,
      });
    });

    it('writes its own in TEAM_WRITES, with a theme from the list', async () => {
      const { svc, prisma } = build({ board: { psMode: 'TEAM_WRITES' } });
      prisma.hackathonTheme.findMany.mockResolvedValue([{ id: 'th-1' }]);
      await svc.lockMyStatement(LEAD, EVENT, {
        title: ' Crop  prices ',
        description: 'Farmers can’t see mandi prices.\nWe fix that.',
        themeId: 'th-1',
      });
      expect(prisma.leaderboardEntrant.updateMany.mock.calls[0][0].data).toMatchObject({
        statementId: null,
        customStatementTitle: 'Crop prices',
        customStatementText: 'Farmers can’t see mandi prices.\nWe fix that.',
        themeId: 'th-1',
      });
    });

    it('refuses a member who is not the lead', async () => {
      const { svc, prisma } = build();
      await expect(svc.lockMyStatement(MEMBER, EVENT, { statementId: PS })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.leaderboardEntrant.updateMany).not.toHaveBeenCalled();
    });

    it('refuses after the deadline', async () => {
      const { svc, prisma } = build({ board: { psDeadline: new Date(Date.now() - 60_000) } });
      await expect(svc.lockMyStatement(LEAD, EVENT, { statementId: PS })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.leaderboardEntrant.updateMany).not.toHaveBeenCalled();
    });

    it('refuses when the curator assigns statements', async () => {
      const { svc } = build({ board: { psMode: 'CURATOR_ASSIGNS' } });
      await expect(svc.lockMyStatement(LEAD, EVENT, { statementId: PS })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses writing its own when teams pick from the list', async () => {
      const { svc } = build();
      await expect(svc.lockMyStatement(LEAD, EVENT, { title: 'Ours', description: 'Mine' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a team whose statement is already locked', async () => {
      const { svc, prisma } = build();
      prisma.leaderboardEntrant.findUniqueOrThrow.mockResolvedValue(before({ statementLockedAt: new Date() }));
      await expect(svc.lockMyStatement(LEAD, EVENT, { statementId: PS })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.leaderboardEntrant.updateMany).not.toHaveBeenCalled();
    });

    it('loses cleanly to a teammate who locked first', async () => {
      const { svc, prisma, notify } = build();
      prisma.leaderboardEntrant.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.lockMyStatement(LEAD, EVENT, { statementId: PS })).rejects.toBeInstanceOf(ConflictException);
      expect(notify).not.toHaveBeenCalled();
    });

    it('can’t take the last place on a full statement; the statement row is locked while counting', async () => {
      const { svc, prisma } = build();
      prisma.hackathonStatement.findFirst.mockResolvedValue({
        id: PS,
        code: 'PS-01',
        title: 'Clean water',
        themeId: null,
        maxTeams: 2,
      });
      prisma.leaderboardEntrant.count.mockResolvedValue(2);
      await expect(svc.lockMyStatement(LEAD, EVENT, { statementId: PS })).rejects.toThrow(/filled up/);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.leaderboardEntrant.updateMany).not.toHaveBeenCalled();
    });

    it('needs a theme when the statement has none and the curator listed themes', async () => {
      const { svc, prisma } = build();
      prisma.hackathonTheme.findMany.mockResolvedValue([{ id: 'th-1' }]);
      await expect(svc.lockMyStatement(LEAD, EVENT, { statementId: PS })).rejects.toThrow(/Pick a theme/);
    });
  });

  describe('the curator', () => {
    it('assigns in any mode and after the deadline, locking it for the team', async () => {
      const { svc, prisma, notify } = build({
        board: { psMode: 'CURATOR_ASSIGNS', psDeadline: new Date(Date.now() - 60_000) },
      });
      await svc.assignStatement(CURATOR, EVENT, TEAM, { statementId: PS });
      const write = prisma.leaderboardEntrant.updateMany.mock.calls[0][0];
      expect(write.where).toEqual({ id: TEAM });
      expect(write.data).toMatchObject({ statementId: PS, statementSetBy: CURATOR, statementLockedAt: expect.any(Date) });
      expect(notify).toHaveBeenCalledWith(EVENT, expect.any(Array), 'STATEMENT_ASSIGNED', { statementTitle: 'Clean water' });
    });

    it('keeps marks but flags a change made after the team was evaluated', async () => {
      const { svc, prisma } = build();
      prisma.leaderboardEntrant.findUniqueOrThrow.mockResolvedValue(
        before({ statementId: 'ps-old', statementLockedAt: new Date() }),
      );
      prisma.leaderboardJudgment.count.mockResolvedValue(1);
      await svc.assignStatement(CURATOR, EVENT, TEAM, { statementId: PS });
      expect(prisma.leaderboardEntrant.updateMany.mock.calls[0][0].data.statementChangedAfterEvalAt).toEqual(
        expect.any(Date),
      );
    });

    it('re-saving the same statement changes nothing and sends nothing', async () => {
      const locked = new Date('2026-10-01T10:00:00Z');
      const { svc, prisma, notify } = build();
      prisma.leaderboardEntrant.findUniqueOrThrow.mockResolvedValue(before({ statementId: PS, statementLockedAt: locked }));
      await svc.assignStatement(CURATOR, EVENT, TEAM, { statementId: PS });
      expect(prisma.leaderboardEntrant.updateMany.mock.calls[0][0].data.statementLockedAt).toBeUndefined();
      expect(notify).not.toHaveBeenCalled();
    });

    it('can’t assign to a cancelled team', async () => {
      const { svc } = build({ team: { cancelledAt: new Date() } });
      await expect(svc.assignStatement(CURATOR, EVENT, TEAM, { statementId: PS })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('reopens a statement: clears it (freeing the place) and the lock', async () => {
      const { svc, prisma, notify } = build({ team: { statementId: PS, statementLockedAt: new Date() } });
      await svc.unlockStatement(CURATOR, EVENT, TEAM);
      expect(prisma.leaderboardEntrant.update).toHaveBeenCalledWith({
        where: { id: TEAM },
        data: expect.objectContaining({ statementId: null, themeId: null, statementLockedAt: null }),
      });
      expect(notify).toHaveBeenCalledWith(EVENT, expect.any(Array), 'STATEMENT_UNLOCKED');
    });

    it('won’t delete a statement an active team has', async () => {
      const { svc, prisma } = build();
      prisma.leaderboardEntrant.count.mockResolvedValue(1);
      await expect(svc.deleteStatement(CURATOR, EVENT, PS)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.hackathonStatement.delete).not.toHaveBeenCalled();
    });

    it('checks the curator capability first', async () => {
      const { svc, leaderboard } = build();
      leaderboard.assertCanManage.mockRejectedValue(new ForbiddenException());
      await expect(svc.assignStatement(MEMBER, EVENT, TEAM, { statementId: PS })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
