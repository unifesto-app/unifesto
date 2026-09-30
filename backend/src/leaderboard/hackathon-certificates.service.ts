import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificatesService } from '../certificates/certificates.service';
import { LeaderboardService } from './leaderboard.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import type { IssueHackathonCertificatesDto } from './dto/hackathon.dto';

/**
 * Hackathon certificates (docs/hackathon-mobile-plan.md §9.2): a thin wrapper
 * over the certificates module. Participants = every non-cancelled team's
 * registration (one certificate per claimed seat, as the module already does);
 * winners = the teams holding a published award, one batch per award so the
 * template's `{awardTitle}` prints the right award. `{teamName}` / `{teamCode}`
 * come from the recipient's team. The curator picks an existing template;
 * designing templates stays on the Space web certificates page.
 *
 * Viewing needs `event:manage-leaderboard`; issuing needs
 * `event:declare-hackathon-winners` (Curator / Space Admin, not Co-Curator).
 * The space's certificates plan and the post-event issuance window still apply.
 */
@Injectable()
export class HackathonCertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
    private readonly certificates: CertificatesService,
  ) {}

  async getOverview(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const [setup, canIssue, teams, awards] = await Promise.all([
      this.certificates.hackathonSetup(eventId),
      this.leaderboard.canDeclareWinners(userId, eventId),
      this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId: board.id, cancelledAt: null, registrationId: { not: null } },
        select: { registrationId: true },
      }),
      this.prisma.leaderboardAward.findMany({
        where: { leaderboardId: board.id, published: true },
        orderBy: { order: 'asc' },
        select: { id: true, title: true, entrant: { select: { teamCode: true, name: true, cancelledAt: true } } },
      }),
    ]);
    const regIds = teams.map((t) => t.registrationId!);
    // One certificate per person holding a seat (a group without seats: its lead).
    const seats = regIds.length
      ? await this.prisma.groupSeat.groupBy({
          by: ['registrationId'],
          where: { registrationId: { in: regIds }, status: 'CLAIMED', claimedByUserId: { not: null } },
          _count: { _all: true },
        })
      : [];
    const people = regIds.reduce((n, id) => n + Math.max(1, seats.find((s) => s.registrationId === id)?._count._all ?? 0), 0);
    const awardTitle = new Map(awards.map((a) => [a.id, a.title]));

    return {
      canIssue,
      planAllowed: setup.planAllowed,
      window: setup.window,
      templates: setup.templates,
      participants: { teams: regIds.length, people },
      winners: awards
        .filter((a) => !a.entrant.cancelledAt)
        .map((a) => ({ awardId: a.id, title: a.title, team: { teamCode: a.entrant.teamCode, name: a.entrant.name } })),
      batches: setup.batches.map((b) => ({
        id: b.id,
        status: b.status,
        // What it was for: an award (winners), or everyone else.
        label: b.awardId ? (awardTitle.get(b.awardId) ?? 'Award') : b.audience === 'MANUAL' ? 'Participants' : 'Attendees',
        kind: b.awardId ? ('WINNERS' as const) : ('PARTICIPANTS' as const),
        total: b.total,
        issued: b.issued,
        reactivated: b.reactivated,
        skipped: b.skipped,
        failed: b.failed,
        error: b.error,
        createdAt: b.createdAt,
        finishedAt: b.finishedAt,
      })),
    };
  }

  /**
   * Issue participant or winner certificates from a template. Participants:
   * one batch for every non-cancelled team. Winners: one batch per published
   * award. Recipients who already hold one from this template (and award) are
   * skipped, so running it again only reaches new people.
   */
  async issue(userId: string, eventId: string, dto: IssueHackathonCertificatesDto) {
    await this.leaderboard.assertCanDeclareWinners(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const batchIds: string[] = [];

    if (dto.audience === 'PARTICIPANTS') {
      const teams = await this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId: board.id, cancelledAt: null, registrationId: { not: null } },
        select: { registrationId: true },
      });
      if (!teams.length) throw new BadRequestException('Import teams first.');
      const { batchId } = await this.certificates.issueForRegistrations(
        userId,
        eventId,
        dto.templateId,
        [...new Set(teams.map((t) => t.registrationId!))],
      );
      batchIds.push(batchId);
    } else {
      const awards = await this.prisma.leaderboardAward.findMany({
        where: { leaderboardId: board.id, published: true, entrant: { cancelledAt: null, registrationId: { not: null } } },
        orderBy: { order: 'asc' },
        select: { id: true, entrant: { select: { registrationId: true } } },
      });
      if (!awards.length) throw new BadRequestException('Publish winners first.');
      for (const a of awards) {
        const { batchId } = await this.certificates.issueForRegistrations(userId, eventId, dto.templateId, [a.entrant.registrationId!], a.id);
        batchIds.push(batchId);
      }
    }
    return { batchIds, ...(await this.getOverview(userId, eventId)) };
  }

  /** One batch's progress, for polling after issuing. */
  async batch(userId: string, eventId: string, batchId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const b = await this.certificates.batchForEvent(eventId, batchId);
    return {
      id: b.id,
      status: b.status,
      total: b.total,
      issued: b.issued,
      reactivated: b.reactivated,
      skipped: b.skipped,
      failed: b.failed,
      error: b.error,
    };
  }
}
