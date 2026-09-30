import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HackathonCertificatesService } from './hackathon-certificates.service';

/**
 * Hackathon certificates: issuing is for Curators / Space Admins, participants
 * are every non-cancelled team, winners get one batch per published award.
 */
describe('HackathonCertificatesService', () => {
  const EVENT = 'event-1';
  const build = (over: { canDeclare?: boolean; teams?: any[]; awards?: any[] } = {}) => {
    const prisma: any = {
      leaderboardEntrant: { findMany: jest.fn().mockResolvedValue(over.teams ?? [{ registrationId: 'r1' }, { registrationId: 'r2' }]) },
      leaderboardAward: { findMany: jest.fn().mockResolvedValue(over.awards ?? []) },
      groupSeat: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const leaderboard: any = {
      assertCanManage: jest.fn(),
      assertCanDeclareWinners: jest.fn(async () => {
        if (over.canDeclare === false) throw new ForbiddenException('Not allowed');
      }),
      canDeclareWinners: jest.fn().mockResolvedValue(over.canDeclare ?? true),
    };
    const teams: any = { getBoardOrThrow: jest.fn().mockResolvedValue({ id: 'board-1', eventId: EVENT }), syncCancellations: jest.fn() };
    let n = 0;
    const certificates: any = {
      issueForRegistrations: jest.fn(async () => ({ batchId: `b${++n}` })),
      hackathonSetup: jest.fn().mockResolvedValue({ planAllowed: true, window: { closesAt: '', isOpen: true }, templates: [], batches: [] }),
    };
    return { svc: new HackathonCertificatesService(prisma, leaderboard, teams, certificates), certificates, prisma };
  };

  it('a Co-Curator (no declare-winners capability) can’t issue', async () => {
    const { svc, certificates } = build({ canDeclare: false });
    await expect(svc.issue('co', EVENT, { templateId: 't', audience: 'PARTICIPANTS' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(certificates.issueForRegistrations).not.toHaveBeenCalled();
  });

  it('participants: one batch for every non-cancelled team', async () => {
    const { svc, certificates, prisma } = build();
    const res = await svc.issue('curator', EVENT, { templateId: 't', audience: 'PARTICIPANTS' });
    expect(certificates.issueForRegistrations).toHaveBeenCalledWith('curator', EVENT, 't', ['r1', 'r2']);
    expect(prisma.leaderboardEntrant.findMany.mock.calls[0][0].where.cancelledAt).toBeNull();
    expect(res.batchIds).toEqual(['b1']);
  });

  it('winners: one batch per published award, carrying the award', async () => {
    const { svc, certificates } = build({
      awards: [
        { id: 'a1', entrant: { registrationId: 'r1' } },
        { id: 'a2', entrant: { registrationId: 'r1' } },
      ],
    });
    const res = await svc.issue('curator', EVENT, { templateId: 't', audience: 'WINNERS' });
    expect(certificates.issueForRegistrations).toHaveBeenNthCalledWith(1, 'curator', EVENT, 't', ['r1'], 'a1');
    expect(certificates.issueForRegistrations).toHaveBeenNthCalledWith(2, 'curator', EVENT, 't', ['r1'], 'a2');
    expect(res.batchIds).toEqual(['b1', 'b2']);
  });

  it('winners before any are published are refused', async () => {
    const { svc } = build({ awards: [] });
    await expect(svc.issue('curator', EVENT, { templateId: 't', audience: 'WINNERS' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
