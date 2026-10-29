import { HackathonTeamsService } from './hackathon-teams.service';

/** E11: the curator team list pages in Team ID order and loads details for the page only. */
describe('HackathonTeamsService.listTeams paging', () => {
  const keys = [
    { id: 't3', teamSeq: 3, teamCode: 'T-03' },
    { id: 't1', teamSeq: 1, teamCode: 'T-01' },
    { id: 'tx', teamSeq: null, teamCode: 'ZZ' },
    { id: 't2', teamSeq: 2, teamCode: 'T-02' },
  ];
  const detail = (id: string) => ({
    ...keys.find((k) => k.id === id)!,
    name: id, teamNameSource: 'AUTO', cancelledAt: null, registrationId: null, room: null,
    statementLockedAt: null, statement: null, customTitle: null, customDescription: null,
  });

  const setup = () => {
    const prisma: any = {
      leaderboardEntrant: {
        findMany: jest.fn(async ({ where, select }: any) =>
          select.name ? (where.id?.in ?? keys.map((k) => k.id)).map(detail) : keys,
        ),
      },
    };
    const svc = new HackathonTeamsService(prisma, { assertCanManage: jest.fn() } as any, { emit: jest.fn() } as any);
    jest.spyOn(svc, 'getBoardOrThrow').mockResolvedValue({ id: 'b1' } as any);
    jest.spyOn(svc, 'syncCancellations').mockResolvedValue();
    const eliminated = jest.spyOn(svc, 'eliminatedIds').mockResolvedValue(new Set());
    return { prisma, svc, eliminated };
  };

  it('returns one page in Team ID order, hand-typed codes last', async () => {
    const { prisma, svc, eliminated } = setup();
    const page = await svc.listTeams('cur', 'ev-1', { take: 2, skip: 1 });
    expect(page.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(prisma.leaderboardEntrant.findMany.mock.calls[1][0].where.id).toEqual({ in: ['t2', 't3'] });
    expect(eliminated).toHaveBeenCalledWith('b1', ['t2', 't3']);
  });

  it('without a page, returns every team as before', async () => {
    const { svc } = setup();
    expect((await svc.listTeams('cur', 'ev-1')).map((t) => t.id)).toEqual(['t1', 't2', 't3', 'tx']);
  });
});
