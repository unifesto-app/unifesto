import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonRoundsService } from './hackathon-rounds.service';
import {
  SUBMISSION_NOTES_MAX,
  cleanLinks,
  isEliminated,
  readLinks,
  submissionOpen,
  takesPart,
  teamStage,
} from './hackathon.shared';
import type { SaveSubmissionDto } from './dto/hackathon.dto';

/**
 * Project links (docs/hackathon-mobile-plan.md §2 #22, §6.4): each team keeps
 * its links (repo, demo, deck…) per round, and the judges or mentors who see
 * the team read them while evaluating. Any team member can edit them while the
 * round isn't closed and before its `submissionsCloseAt`, once the team has a
 * locked statement and takes part in the round.
 */
@Injectable()
export class HackathonSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teams: HackathonTeamsService,
    private readonly rounds: HackathonRoundsService,
  ) {}

  /** The team's links for every round, and whether it can still change each. */
  async getMine(userId: string, eventId: string) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    const [ctx, rows] = await Promise.all([
      this.rounds.context(board.id),
      this.prisma.hackathonSubmission.findMany({
        where: { entrantId: team.id },
        select: { roundId: true, links: true, notes: true, updatedAt: true, submittedBy: true },
      }),
    ]);
    const editors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.submittedBy))] } },
      select: { id: true, fullName: true, username: true },
    });
    const now = new Date();
    const standing = (roundId: string) => ctx.standing(team.id, roundId);
    const stage = teamStage({
      cancelled: !!team.cancelledAt,
      statementLockedAt: team.statementLockedAt,
      eliminated: isEliminated(ctx.rounds, standing),
    });
    return {
      eventId,
      stage,
      team: { id: team.id, teamCode: team.teamCode, name: team.name },
      rounds: ctx.rounds.map((r) => {
        const row = rows.find((x) => x.roundId === r.id);
        const editor = row ? editors.find((u) => u.id === row.submittedBy) : undefined;
        return {
          roundId: r.id,
          name: r.name,
          kind: r.kind,
          status: r.status,
          closesAt: r.submissionsCloseAt,
          canEdit: this.canEdit(ctx, team.id, stage, r, now),
          links: readLinks(row?.links),
          notes: row?.notes ?? null,
          updatedAt: row?.updatedAt ?? null,
          updatedBy: editor ? editor.fullName || editor.username : null,
        };
      }),
    };
  }

  /** Save the team's links for a round (replaces them). */
  async saveMine(userId: string, eventId: string, roundId: string, dto: SaveSubmissionDto) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    const round = await this.rounds.findRoundOrThrow(board.id, roundId);
    const ctx = await this.rounds.context(board.id);
    const stage = teamStage({
      cancelled: !!team.cancelledAt,
      statementLockedAt: team.statementLockedAt,
      eliminated: isEliminated(ctx.rounds, (r) => ctx.standing(team.id, r)),
    });
    if (!this.canEdit(ctx, team.id, stage, round, new Date())) {
      if (stage === 'NEEDS_PS') throw new ForbiddenException('Lock in your problem statement first.');
      if (stage === 'CANCELLED') throw new ForbiddenException('This registration was cancelled.');
      if (round.status === 'CLOSED' || (round.submissionsCloseAt && round.submissionsCloseAt <= new Date())) {
        throw new BadRequestException(`Links for ${round.name} are closed.`);
      }
      throw new ForbiddenException(`Your team isn't in ${round.name}.`);
    }
    const cleaned = cleanLinks(dto.links);
    if ('error' in cleaned) throw new BadRequestException(cleaned.error);
    const notes = (dto.notes ?? '').replace(/\r\n/g, '\n').trim().slice(0, SUBMISSION_NOTES_MAX) || null;
    const links = cleaned.links as unknown as Prisma.InputJsonValue;
    await this.prisma.hackathonSubmission.upsert({
      where: { entrantId_roundId: { entrantId: team.id, roundId } },
      create: { entrantId: team.id, roundId, links, notes, submittedBy: userId },
      update: { links, notes, submittedBy: userId },
    });
    return this.getMine(userId, eventId);
  }

  /** A team with a locked statement that takes part in the round, before the cut-off. */
  private canEdit(
    ctx: Awaited<ReturnType<HackathonRoundsService['context']>>,
    teamId: string,
    stage: string,
    round: { id: string; status: 'PENDING' | 'ACTIVE' | 'CLOSED'; submissionsCloseAt: Date | null },
    now: Date,
  ): boolean {
    if (stage !== 'ACTIVE') return false;
    if (!takesPart(ctx.rounds, (r) => ctx.standing(teamId, r), round.id).in) return false;
    return submissionOpen(round, now);
  }

  private async myTeamOrThrow(userId: string, eventId: string) {
    const board = await this.teams.getBoardOrThrow(eventId);
    if (!board.enabled) throw new NotFoundException('Hackathon mode is not on for this event');
    const team = await this.teams.findMyTeam(board.id, eventId, userId);
    if (!team) throw new NotFoundException("You're not on a team for this hackathon");
    return { board, team };
  }
}
