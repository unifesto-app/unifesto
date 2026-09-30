import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardGateway } from './leaderboard.gateway';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonJudgesService } from './hackathon-judges.service';
import { TEAM_STATEMENT_SELECT, statementView } from './hackathon.views';
import {
  cleanName,
  compareTeams,
  competitionRanks,
  cumulativeTotal,
  editableUntil,
  evaluationTotal,
  finalRoundId,
  judgmentLocked,
  takesPart,
  teamStage,
  toCsv,
  type RoundStanding,
} from './hackathon.shared';
import type { CreateHackathonAwardDto, PublishAwardsDto, UpdateHackathonAwardDto } from './dto/hackathon.dto';

/** Trimmed text, or null when nothing is left. Keeps line breaks. */
const cleanText = (raw: string | null | undefined, max: number): string | null => {
  const s = (raw ?? '').replace(/\r\n/g, '\n').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Hackathon results and winners (docs/hackathon-mobile-plan.md §9, §2 #19–#20):
 * the curator's marks matrix and ranking per round and overall (PER_ROUND or
 * CUMULATIVE), the results CSV, and awards with notes. Only submitted
 * evaluations count. Rankings guide the curator; advancing and winners stay
 * manual. Viewing needs `event:manage-leaderboard`; declaring and publishing
 * winners needs `event:declare-hackathon-winners` (Curator / Space Admin).
 */
@Injectable()
export class HackathonResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
    private readonly judges: HackathonJudgesService,
    @Inject(forwardRef(() => LeaderboardGateway))
    private readonly gateway: LeaderboardGateway,
  ) {}

  // ── Results ───────────────────────────────────────────────────────────────

  /**
   * Every team with its score, rank and decision per round, each judge's
   * submitted marks, the overall total and rank, awards and the "statement
   * changed after evaluation" flag. Ranks leave out cancelled teams.
   */
  async getResults(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const [settings, rounds, metrics, entrants, judgments, scores, canDeclare] = await Promise.all([
      this.prisma.leaderboard.findUniqueOrThrow({ where: { id: board.id }, select: { scoringMode: true, revealReviews: true } }),
      this.prisma.leaderboardRound.findMany({ where: { leaderboardId: board.id }, orderBy: { order: 'asc' } }),
      this.prisma.leaderboardMetric.findMany({
        where: { leaderboardId: board.id },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, label: true, roundId: true, maxValue: true, weight: true },
      }),
      this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId: board.id },
        select: {
          id: true,
          teamCode: true,
          teamSeq: true,
          name: true,
          cancelledAt: true,
          room: { select: { name: true } },
          entrantRounds: { select: { roundId: true, status: true } },
          awards: { orderBy: { order: 'asc' }, select: { title: true, published: true } },
          ...TEAM_STATEMENT_SELECT,
        },
      }),
      this.prisma.leaderboardJudgment.findMany({
        where: { entrant: { leaderboardId: board.id }, submittedAt: { not: null } },
        select: { id: true, entrantId: true, roundId: true, panelistUserId: true, submittedAt: true, reopenedAt: true, overallReview: true },
      }),
      this.prisma.leaderboardScore.findMany({
        where: { entrant: { leaderboardId: board.id }, judgeUserId: { not: null } },
        select: { entrantId: true, roundId: true, judgeUserId: true, metricId: true, value: true, comment: true },
      }),
      this.leaderboard.canDeclareWinners(userId, eventId),
    ]);
    const judgeIds = [...new Set(judgments.map((j) => j.panelistUserId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: judgeIds } },
      select: { id: true, fullName: true, username: true },
    });
    const judgeName = (id: string) => {
      const u = users.find((x) => x.id === id);
      return u?.fullName || u?.username || 'Judge';
    };

    const now = new Date();
    const roundCriteria = new Map(
      rounds.map((r) => [r.id, metrics.filter((m) => m.roundId === null || m.roundId === r.id)]),
    );
    const standingOf = (e: (typeof entrants)[number]) => (roundId: string): RoundStanding =>
      (e.entrantRounds.find((x) => x.roundId === roundId)?.status as RoundStanding | undefined) ?? 'PENDING';

    // Per team, per round: its submitted evaluations and the round score (their average).
    const teamRows = entrants.sort(compareTeams).map((e) => {
      const standing = standingOf(e);
      const perRound = rounds.map((r) => {
        const criteria = roundCriteria.get(r.id)!;
        const weights = new Map(criteria.map((m) => [m.id, Number(m.weight)]));
        const evaluations = judgments
          .filter((j) => j.entrantId === e.id && j.roundId === r.id)
          .map((j) => {
            const marks = scores
              .filter((s) => s.entrantId === e.id && s.roundId === r.id && s.judgeUserId === j.panelistUserId && weights.has(s.metricId))
              .map((s) => ({ metricId: s.metricId, value: Number(s.value), comment: s.comment }));
            return {
              judgmentId: j.id,
              judgeUserId: j.panelistUserId,
              judgeName: judgeName(j.panelistUserId),
              submittedAt: j.submittedAt,
              editableUntil: editableUntil(j),
              locked: judgmentLocked(j, now),
              total: evaluationTotal(marks, weights),
              marks,
              review: j.overallReview,
            };
          });
        const score = evaluations.length
          ? Math.round((evaluations.reduce((s, x) => s + x.total, 0) / evaluations.length) * 1e4) / 1e4
          : null;
        return {
          roundId: r.id,
          takesPart: takesPart(rounds, standing, r.id).in,
          standing: standing(r.id),
          score,
          rank: null as number | null,
          evaluations,
        };
      });
      return { e, standing, perRound };
    });

    // Round ranks among the (non-cancelled) teams that were evaluated in it.
    for (const r of rounds) {
      const ranked = competitionRanks(
        teamRows
          .filter((t) => !t.e.cancelledAt)
          .map((t) => ({ id: t.e.id, score: t.perRound.find((p) => p.roundId === r.id)!.score })),
      );
      for (const x of ranked) {
        const cell = teamRows.find((t) => t.e.id === x.id)!.perRound.find((p) => p.roundId === r.id)!;
        cell.rank = x.rank;
      }
    }

    // Overall: the final round's score (PER_ROUND) or the sum of the counted rounds (CUMULATIVE).
    const cumulative = settings.scoringMode === 'CUMULATIVE';
    const finalId = finalRoundId(rounds);
    const counted = new Set(rounds.filter((r) => r.countsTowardTotal).map((r) => r.id));
    const totals = teamRows.map((t) => {
      const scored = t.perRound.filter((p) => p.score != null);
      const total = cumulative
        ? scored.some((p) => counted.has(p.roundId))
          ? cumulativeTotal(new Map(scored.map((p) => [p.roundId, p.score!])), counted)
          : null
        : (t.perRound.find((p) => p.roundId === finalId)?.score ?? null);
      return { id: t.e.id, score: t.e.cancelledAt ? null : total, total };
    });
    const overall = new Map(competitionRanks(totals).map((x) => [x.id, x]));

    return {
      scoringMode: settings.scoringMode,
      revealReviews: settings.revealReviews,
      canDeclareWinners: canDeclare,
      finalRoundId: cumulative ? null : finalId,
      rounds: rounds.map((r) => {
        const criteria = roundCriteria.get(r.id)!;
        return {
          id: r.id,
          name: r.name,
          order: r.order,
          status: r.status,
          judgingMode: r.judgingMode,
          eliminationEnabled: r.eliminationEnabled,
          countsTowardTotal: r.countsTowardTotal,
          criteria: criteria.map((m) => ({ id: m.id, label: m.label, maxValue: Number(m.maxValue), weight: Number(m.weight) })),
          maxScore: criteria.reduce((s, m) => s + Number(m.weight) * Number(m.maxValue), 0),
        };
      }),
      teams: teamRows
        .map((t) => {
          const ps = statementView(t.e);
          const o = overall.get(t.e.id)!;
          return {
            id: t.e.id,
            teamCode: t.e.teamCode,
            name: t.e.name,
            stage: teamStage({
              cancelled: !!t.e.cancelledAt,
              statementLockedAt: t.e.statementLockedAt,
              eliminated: rounds.some((r) => t.standing(r.id) === 'ELIMINATED'),
            }),
            room: t.e.room?.name ?? null,
            statement: ps ? { code: ps.code, title: ps.title, themeLabel: ps.themeLabel } : null,
            psChangedAfterEvalAt: t.e.statementChangedAfterEvalAt,
            total: o.total,
            rank: o.rank,
            awards: t.e.awards,
            rounds: t.perRound,
          };
        })
        .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)),
    };
  }

  /**
   * The results as one CSV (plan §9.1): team details, then per round the
   * score, rank, decision and each judge's marks per criterion with their
   * total; then the overall total, rank and awards.
   */
  async resultsCsv(userId: string, eventId: string): Promise<{ filename: string; csv: string }> {
    const results = await this.getResults(userId, eventId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { slug: true } });
    const cumulative = results.scoringMode === 'CUMULATIVE';

    // Per round: the judges who submitted anything in it, in name order.
    const roundJudges = new Map(
      results.rounds.map((r) => {
        const seen = new Map<string, string>();
        for (const t of results.teams) {
          for (const ev of t.rounds.find((p) => p.roundId === r.id)!.evaluations) seen.set(ev.judgeUserId, ev.judgeName);
        }
        return [r.id, [...seen].sort((a, b) => a[1].localeCompare(b[1]))];
      }),
    );

    const header: string[] = ['Team ID', 'Team name', 'Status', 'Room', 'PS code', 'Problem statement', 'Theme', 'PS changed after evaluation'];
    for (const r of results.rounds) {
      header.push(`${r.name} score`, `${r.name} rank`, `${r.name} decision`, `${r.name} evaluations`);
      for (const [, name] of roundJudges.get(r.id)!) {
        for (const c of r.criteria) header.push(`${r.name} · ${name} · ${c.label}`);
        header.push(`${r.name} · ${name} · total`);
      }
    }
    header.push(cumulative ? 'Cumulative total' : 'Final score', 'Overall rank', 'Awards');

    const STATUS: Record<string, string> = { CANCELLED: 'cancelled', ELIMINATED: 'eliminated', ACTIVE: 'active', NEEDS_PS: 'no statement yet' };
    const DECISION: Record<RoundStanding, string> = { PENDING: 'undecided', ADVANCED: 'advanced', ELIMINATED: 'eliminated' };
    const rows: unknown[][] = results.teams.map((t) => {
      const row: unknown[] = [
        t.teamCode ?? '',
        t.name,
        STATUS[t.stage] ?? t.stage,
        t.room ?? '',
        t.statement?.code ?? '',
        t.statement?.title ?? '',
        t.statement?.themeLabel ?? '',
        t.psChangedAfterEvalAt ? 'yes' : '',
      ];
      for (const r of results.rounds) {
        const p = t.rounds.find((x) => x.roundId === r.id)!;
        row.push(p.score ?? '', p.rank ?? '', p.takesPart ? DECISION[p.standing] : '', p.evaluations.length || '');
        for (const [judgeId] of roundJudges.get(r.id)!) {
          const ev = p.evaluations.find((x) => x.judgeUserId === judgeId);
          for (const c of r.criteria) row.push(ev?.marks.find((m) => m.metricId === c.id)?.value ?? '');
          row.push(ev?.total ?? '');
        }
      }
      row.push(t.total ?? '', t.rank ?? '', t.awards.map((a) => (a.published ? a.title : `${a.title} (not published)`)).join('; '));
      return row;
    });
    return { filename: `${event?.slug ?? 'hackathon'}-results.csv`, csv: toCsv([header, ...rows]) };
  }

  // ── Winners ───────────────────────────────────────────────────────────────

  /** Awards with their teams and notes, plus the teams that can win (by overall rank). */
  async listAwards(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const [awards, candidates, canDeclare] = await Promise.all([
      this.prisma.leaderboardAward.findMany({
        where: { leaderboardId: board.id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          notes: true,
          order: true,
          published: true,
          declaredAt: true,
          entrant: { select: { id: true, teamCode: true, name: true, cancelledAt: true } },
        },
      }),
      this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId: board.id, cancelledAt: null, statementLockedAt: { not: null } },
        select: { id: true, teamCode: true, teamSeq: true, name: true, rank: true, totalScore: true },
      }),
      this.leaderboard.canDeclareWinners(userId, eventId),
    ]);
    return {
      canDeclareWinners: canDeclare,
      awards: awards.map((a) => ({
        id: a.id,
        title: a.title,
        notes: a.notes,
        order: a.order,
        published: a.published,
        declaredAt: a.declaredAt,
        team: { id: a.entrant.id, teamCode: a.entrant.teamCode, name: a.entrant.name, cancelled: !!a.entrant.cancelledAt },
      })),
      teams: candidates.sort(compareTeams).map((t) => ({ id: t.id, teamCode: t.teamCode, name: t.name })),
    };
  }

  async createAward(userId: string, eventId: string, dto: CreateHackathonAwardDto) {
    await this.leaderboard.assertCanDeclareWinners(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const title = cleanName(dto.title, 160);
    if (!title) throw new BadRequestException('Name the award, like "Winner" or "Best design".');
    if (!dto.entrantId) throw new BadRequestException('Pick the winning team.');
    await this.assertWinnable(board.id, dto.entrantId);
    const last = await this.prisma.leaderboardAward.findFirst({
      where: { leaderboardId: board.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    try {
      await this.prisma.leaderboardAward.create({
        data: {
          leaderboardId: board.id,
          entrantId: dto.entrantId,
          title,
          notes: cleanText(dto.notes, 2000),
          order: dto.order ?? (last ? last.order + 1 : 0),
          declaredBy: userId,
        },
      });
    } catch (err) {
      throw this.titleTaken(err, title);
    }
    return this.listAwards(userId, eventId);
  }

  async updateAward(userId: string, eventId: string, awardId: string, dto: UpdateHackathonAwardDto) {
    await this.leaderboard.assertCanDeclareWinners(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const award = await this.findAwardOrThrow(board.id, awardId);
    const data: Prisma.LeaderboardAwardUncheckedUpdateInput = {};
    if (dto.title !== undefined) {
      const title = cleanName(dto.title, 160);
      if (!title) throw new BadRequestException('Name the award.');
      data.title = title;
    }
    if (dto.entrantId !== undefined && dto.entrantId !== award.entrantId) {
      if (award.published) throw new BadRequestException('This award is published. Unpublish it before changing the team.');
      await this.assertWinnable(board.id, dto.entrantId);
      data.entrantId = dto.entrantId;
    }
    if (dto.notes !== undefined) data.notes = cleanText(dto.notes, 2000);
    if (dto.order !== undefined) data.order = dto.order;
    try {
      await this.prisma.leaderboardAward.update({ where: { id: award.id }, data });
    } catch (err) {
      throw this.titleTaken(err, String(data.title ?? award.title));
    }
    if (award.published) await this.leaderboard.recomputeAndBroadcast(board.id);
    return this.listAwards(userId, eventId);
  }

  async deleteAward(userId: string, eventId: string, awardId: string) {
    await this.leaderboard.assertCanDeclareWinners(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const award = await this.findAwardOrThrow(board.id, awardId);
    if (award.published) throw new BadRequestException('This award is published. Unpublish it first.');
    await this.prisma.leaderboardAward.delete({ where: { id: award.id } });
    return this.listAwards(userId, eventId);
  }

  /**
   * Publish awards (all unpublished ones, or the given ones). Each winning
   * team hears "You won <award>!"; every other team in the hackathon and every
   * judge hears "Winners announced" (plan §3 #15).
   */
  async publishAwards(userId: string, eventId: string, dto: PublishAwardsDto) {
    await this.leaderboard.assertCanDeclareWinners(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const toPublish = await this.prisma.leaderboardAward.findMany({
      where: { leaderboardId: board.id, published: false, ...(dto.awardIds?.length ? { id: { in: dto.awardIds } } : {}) },
      select: { id: true, title: true, entrant: { select: { id: true, name: true, teamCode: true, cancelledAt: true } } },
    });
    if (!toPublish.length) throw new BadRequestException('Nothing to publish: add an award first.');
    const cancelled = toPublish.find((a) => a.entrant.cancelledAt);
    if (cancelled) {
      throw new BadRequestException(`${cancelled.entrant.teamCode ?? cancelled.entrant.name}'s registration was cancelled. Change the team for ${cancelled.title} first.`);
    }
    const now = new Date();
    await this.prisma.leaderboardAward.updateMany({
      where: { id: { in: toPublish.map((a) => a.id) }, published: false },
      data: { published: true, declaredBy: userId, declaredAt: now },
    });
    await this.leaderboard.recomputeAndBroadcast(board.id);
    this.gateway.hackathonChanged(eventId);

    if (board.enabled) {
      for (const a of toPublish) await this.teams.notify(eventId, [a.entrant], 'WON', { awardTitle: a.title });
      const winners = new Set(toPublish.map((a) => a.entrant.id));
      const others = await this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId: board.id, cancelledAt: null, statementLockedAt: { not: null }, id: { notIn: [...winners] } },
        select: { id: true, name: true, teamCode: true },
      });
      await this.teams.notify(eventId, others, 'WINNERS_ANNOUNCED');
      const judges = await this.prisma.hackathonJudgeProfile.findMany({ where: { leaderboardId: board.id }, select: { userId: true } });
      await this.judges.notifyJudges(eventId, judges.map((j) => j.userId), 'WINNERS_ANNOUNCED');
    }
    return this.listAwards(userId, eventId);
  }

  async unpublishAward(userId: string, eventId: string, awardId: string) {
    await this.leaderboard.assertCanDeclareWinners(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const award = await this.findAwardOrThrow(board.id, awardId);
    if (award.published) {
      await this.prisma.leaderboardAward.update({
        where: { id: award.id },
        data: { published: false, declaredAt: null },
      });
      await this.leaderboard.recomputeAndBroadcast(board.id);
    }
    return this.listAwards(userId, eventId);
  }

  /** A winner has to be a team in the hackathon: not cancelled, statement locked. */
  private async assertWinnable(leaderboardId: string, entrantId: string) {
    const team = await this.prisma.leaderboardEntrant.findFirst({
      where: { id: entrantId, leaderboardId },
      select: { cancelledAt: true, statementLockedAt: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    if (team.cancelledAt) throw new BadRequestException("This team's registration was cancelled.");
    if (!team.statementLockedAt) throw new BadRequestException("This team never locked in a problem statement, so it didn't take part.");
  }

  private async findAwardOrThrow(leaderboardId: string, awardId: string) {
    const award = await this.prisma.leaderboardAward.findFirst({ where: { id: awardId, leaderboardId } });
    if (!award) throw new NotFoundException('Award not found');
    return award;
  }

  private titleTaken(err: unknown, title: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(`There's already an award called ${title}. Give this one a different name, like "${title} — Design".`);
    }
    return err;
  }
}
