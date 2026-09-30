import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonHelpService } from './hackathon-help.service';
import { HackathonSetupService } from './hackathon-setup.service';

/**
 * Hackathon services with a hand-faked Prisma, pinning the rules that matter
 * to curators and teams: only GROUP registrations become teams, Team IDs move
 * forward only, only the lead renames the team, and the on/off switch rules.
 */
describe('Hackathon services', () => {
  const EVENT = 'event-1';
  const BOARD = 'board-1';
  const CURATOR = 'curator-1';
  const LEAD = 'lead-1';
  const MEMBER = 'member-1';

  const board = (over: Record<string, unknown> = {}) => ({
    id: BOARD,
    eventId: EVENT,
    isHackathon: true,
    enabled: true,
    teamCodePrefix: 'H-',
    teamCodeDigits: 3,
    teamCodeNext: 1,
    teamNameFieldId: null,
    venueName: null,
    venueAddress: null,
    venueLat: null,
    venueLng: null,
    venueMapUrl: null,
    venueNotes: null,
    ...over,
  });

  const build = (prismaOverrides: Record<string, any> = {}) => {
    const prisma: any = {
      leaderboard: {
        findUnique: jest.fn().mockResolvedValue(board()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(board()),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: BOARD }),
      },
      leaderboardEntrant: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      leaderboardEntrantRound: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      hackathonEvalRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      leaderboardRound: {
        findMany: jest.fn().mockResolvedValue([{ id: 'round-1' }]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      eventRegistration: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      groupSeat: { findMany: jest.fn().mockResolvedValue([]) },
      event: { findUnique: jest.fn().mockResolvedValue({ title: 'Hack Day' }) },
      userNotification: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockImplementation(async (arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
      ...prismaOverrides,
    };
    const leaderboard: any = {
      assertCanManage: jest.fn().mockResolvedValue(undefined),
      planAllows: jest.fn().mockResolvedValue(true),
      teamUserIds: jest.fn().mockResolvedValue(new Map()),
    };
    const events = { emit: jest.fn() };
    const teams = new HackathonTeamsService(prisma, leaderboard, events as any);
    const help = new HackathonHelpService(prisma, leaderboard, teams, events as any);
    const setup = new HackathonSetupService(prisma, leaderboard, teams, help);
    return { teams, setup, prisma, leaderboard, events };
  };

  describe('importTeams', () => {
    it('imports only GROUP registrations and reports the individual ones it left out', async () => {
      const { teams, prisma } = build();
      prisma.eventRegistration.findMany.mockResolvedValue([
        { id: 'reg-a', formResponses: {}, user: { fullName: 'Asha', username: null } },
        { id: 'reg-b', formResponses: {}, user: { fullName: null, username: 'bala' } },
      ]);
      prisma.eventRegistration.count.mockResolvedValue(4);

      const res = await teams.importTeams(CURATOR, EVENT, {});

      // The group query filters on groupSize; the individual one is only counted.
      const groupWhere = prisma.eventRegistration.findMany.mock.calls[0][0].where;
      expect(groupWhere.groupSize).toEqual({ gt: 0 });
      expect(res).toEqual({ imported: 2, alreadyImported: 0, individualSkipped: 4, nextTeamCode: 'H-003' });

      const rows = prisma.leaderboardEntrant.createMany.mock.calls[0][0].data;
      expect(rows.map((r: any) => [r.teamCode, r.name, r.teamNameSource])).toEqual([
        ['H-001', "Asha's team", 'DEFAULT'],
        ['H-002', "bala's team", 'DEFAULT'],
      ]);
      // Standing in every existing round, and the counter moved forward.
      expect(prisma.leaderboardEntrantRound.createMany).toHaveBeenCalled();
      expect(prisma.leaderboard.update).toHaveBeenCalledWith({ where: { id: BOARD }, data: { teamCodeNext: 3 } });
    });

    it('locks the board row so two imports cannot hand out the same number', async () => {
      const { teams, prisma } = build();
      await teams.importTeams(CURATOR, EVENT, {});
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('refuses to import before a Team ID prefix is set', async () => {
      const { teams, prisma } = build();
      prisma.leaderboard.findUnique.mockResolvedValue(board({ teamCodePrefix: null }));
      await expect(teams.importTeams(CURATOR, EVENT, {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.leaderboardEntrant.createMany).not.toHaveBeenCalled();
    });

    it('checks the curator capability first', async () => {
      const { teams, leaderboard } = build();
      leaderboard.assertCanManage.mockRejectedValue(new ForbiddenException());
      await expect(teams.importTeams(MEMBER, EVENT, {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('syncCancellations', () => {
    it('stamps cancelled registrations and clears restored ones, keeping the team', async () => {
      const { teams, prisma } = build();
      prisma.leaderboardEntrant.findMany.mockResolvedValue([
        { id: 't1', registrationId: 'r1', cancelledAt: null },
        { id: 't2', registrationId: 'r2', cancelledAt: new Date() },
        { id: 't3', registrationId: 'r3', cancelledAt: null },
      ]);
      prisma.eventRegistration.findMany.mockResolvedValue([
        { id: 'r1', status: 'CANCELLED' },
        { id: 'r2', status: 'REGISTERED' },
        { id: 'r3', status: 'REGISTERED' },
      ]);
      await teams.syncCancellations(BOARD);
      const calls = prisma.leaderboardEntrant.updateMany.mock.calls.map((c: any) => c[0]);
      expect(calls).toContainEqual({ where: { id: { in: ['t1'] } }, data: { cancelledAt: expect.any(Date) } });
      expect(calls).toContainEqual({ where: { id: { in: ['t2'] } }, data: { cancelledAt: null } });
      // Nothing deletes the team or its code.
      expect(prisma.leaderboardEntrant.update).not.toHaveBeenCalled();
      // The cancelled team leaves any queue it was in.
      expect(prisma.hackathonEvalRequest.updateMany).toHaveBeenCalledWith({
        where: { entrantId: { in: ['t1'] }, status: { in: ['WAITING', 'CALLED', 'IN_PROGRESS', 'AWAITING_MARKS'] } },
        data: expect.objectContaining({ status: 'CANCELLED', closedReason: 'TEAM_CANCELLED' }),
      });
    });
  });

  describe('renameMyTeam', () => {
    const onTeam = (prisma: any, leadUserId: string) => {
      prisma.eventRegistration.findMany.mockResolvedValue([]);
      prisma.groupSeat.findMany.mockResolvedValue([{ registrationId: 'reg-a' }]);
      prisma.leaderboardEntrant.findMany
        .mockResolvedValueOnce([{ id: 'team-a' }]) // findMyTeam
        .mockResolvedValueOnce([]); // syncCancellations
      prisma.leaderboardEntrant.findFirst.mockResolvedValue({
        id: 'team-a',
        teamCode: 'H-001',
        name: "Asha's team",
        teamNameSource: 'DEFAULT',
        cancelledAt: null,
        registrationId: 'reg-a',
        room: null,
      });
      prisma.eventRegistration.findUnique.mockResolvedValue({ userId: leadUserId });
    };

    it('lets the lead rename the team', async () => {
      const { teams, prisma } = build();
      onTeam(prisma, LEAD);
      await expect(teams.renameMyTeam(LEAD, EVENT, '  Null  Pointers ')).resolves.toEqual({ name: 'Null Pointers' });
      expect(prisma.leaderboardEntrant.update).toHaveBeenCalledWith({
        where: { id: 'team-a' },
        data: { name: 'Null Pointers', teamNameSource: 'LEAD' },
      });
    });

    it('refuses a member who is not the lead', async () => {
      const { teams, prisma } = build();
      onTeam(prisma, LEAD);
      await expect(teams.renameMyTeam(MEMBER, EVENT, 'Ours now')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.leaderboardEntrant.update).not.toHaveBeenCalled();
    });
  });

  describe('getMyHub', () => {
    it('is null when the event runs no hackathon, or it is switched off', async () => {
      const { teams, prisma } = build();
      prisma.leaderboard.findUnique.mockResolvedValue(null);
      await expect(teams.getMyHub(MEMBER, EVENT)).resolves.toBeNull();
      prisma.leaderboard.findUnique.mockResolvedValue({ ...board({ enabled: false }), event: {} });
      await expect(teams.getMyHub(MEMBER, EVENT)).resolves.toBeNull();
    });

    it('never reads score tables', async () => {
      const leaderboardScore = { findMany: jest.fn(), findFirst: jest.fn() };
      const { teams, prisma } = build({ leaderboardScore });
      prisma.leaderboard.findUnique.mockResolvedValue({ ...board(), event: { title: 'Hack Day' } });
      await teams.getMyHub(MEMBER, EVENT);
      expect(leaderboardScore.findMany).not.toHaveBeenCalled();
      expect(leaderboardScore.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('settings and switch', () => {
    it('never moves the Team ID counter backwards', async () => {
      const { setup, prisma } = build();
      prisma.leaderboard.findUnique.mockResolvedValue(board({ teamCodeNext: 12 }));
      await expect(setup.updateConfig(CURATOR, EVENT, { teamCodeNext: 5 })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.leaderboard.update).not.toHaveBeenCalled();
    });

    it('rejects a prefix with spaces', async () => {
      const { setup } = build();
      await expect(setup.updateConfig(CURATOR, EVENT, { teamCodePrefix: 'HACK 25' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('will not switch off while a round is active', async () => {
      const { setup, prisma } = build();
      prisma.leaderboardRound.count.mockResolvedValue(1);
      await expect(setup.disable(CURATOR, EVENT)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.leaderboard.update).not.toHaveBeenCalled();
    });

    it('will not switch on when the plan does not include it', async () => {
      const { setup, leaderboard, prisma } = build();
      leaderboard.planAllows.mockResolvedValue(false);
      await expect(setup.enable(CURATOR, EVENT)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.leaderboard.create).not.toHaveBeenCalled();
    });

    it('creates the board with a PENDING first round, so nothing is judged yet', async () => {
      const { setup, prisma } = build();
      prisma.leaderboard.findUnique.mockResolvedValueOnce(null); // enable's lookup
      jest.spyOn(setup, 'getOverview').mockResolvedValue({} as any);
      await setup.enable(CURATOR, EVENT);
      expect(prisma.leaderboard.create.mock.calls[0][0].data).toMatchObject({
        isHackathon: true,
        enabled: true,
        mode: 'RUBRIC',
        entrantKind: 'TEAM',
      });
      expect(prisma.leaderboardRound.create.mock.calls[0][0].data.status).toBe('PENDING');
    });

    it('will not turn a board that already has entrants into a hackathon', async () => {
      const { setup, prisma } = build();
      prisma.leaderboard.findUnique.mockResolvedValueOnce({ ...board({ isHackathon: false }), status: 'LIVE' });
      prisma.leaderboardEntrant.count.mockResolvedValue(3);
      await expect(setup.enable(CURATOR, EVENT)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
