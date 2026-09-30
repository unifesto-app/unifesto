import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { LeaderboardPanelistKind, LeaderboardRoundStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardGateway } from './leaderboard.gateway';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonJudgesService } from './hackathon-judges.service';
import {
  OPEN_EVAL_STATUSES,
  compareTeams,
  criterionKey,
  evaluationsRequired,
  roundConfigError,
  takesPart,
  undecidedBefore,
  type RoundRef,
  type RoundStanding,
} from './hackathon.shared';
import type {
  CreateHackathonRoundDto,
  SetHackathonRoundStatusDto,
  SetRoundDecisionsDto,
  SetTeamRoundDecisionDto,
  UpdateHackathonRoundDto,
  UpsertCriterionDto,
} from './dto/hackathon.dto';

/** Everything the eligibility rules need about a board, loaded once. */
export interface RoundContext {
  rounds: (RoundRef & {
    name: string;
    status: LeaderboardRoundStatus;
    kind: 'EVALUATION' | 'MENTORING';
    judgingMode: 'SINGLE' | 'PANEL' | 'MULTI';
    requiredEvaluations: number;
    slotMinutes: number;
    callGraceMinutes: number;
    countsTowardTotal: boolean;
    endAt: Date | null;
    submissionsCloseAt: Date | null;
  })[];
  /** Teams in the hackathon: not cancelled, statement locked. */
  teams: { id: string; teamCode: string | null; teamSeq: number | null; name: string; themeId: string | null }[];
  standing: (entrantId: string, roundId: string) => RoundStanding;
}

/**
 * Hackathon rounds for curators (plan §2 #12, #14–#15, #18, #33–#34): each
 * round's judging mode, slot and grace times, elimination on/off and end time;
 * its criteria; opening it (refused while teams in an earlier eliminating round
 * are undecided) and closing it (open queue requests are cancelled); and the
 * advance/eliminate decision per team.
 */
@Injectable()
export class HackathonRoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
    private readonly judges: HackathonJudgesService,
    @Inject(forwardRef(() => LeaderboardGateway))
    private readonly gateway: LeaderboardGateway,
  ) {}

  // ── Shared context ────────────────────────────────────────────────────────

  async context(leaderboardId: string): Promise<RoundContext> {
    const [rounds, teams, standings] = await Promise.all([
      this.prisma.leaderboardRound.findMany({ where: { leaderboardId }, orderBy: { order: 'asc' } }),
      this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId, cancelledAt: null, statementLockedAt: { not: null } },
        select: { id: true, teamCode: true, teamSeq: true, name: true, themeId: true },
      }),
      this.prisma.leaderboardEntrantRound.findMany({
        where: { round: { leaderboardId } },
        select: { entrantId: true, roundId: true, status: true },
      }),
    ]);
    const byKey = new Map(standings.map((s) => [`${s.roundId}:${s.entrantId}`, s.status as RoundStanding]));
    return {
      rounds,
      teams: teams.sort(compareTeams),
      standing: (entrantId, roundId) => byKey.get(`${roundId}:${entrantId}`) ?? 'PENDING',
    };
  }

  /** Teams taking part in a round, in Team ID order. */
  teamsInRound(ctx: RoundContext, roundId: string) {
    return ctx.teams.filter((t) => takesPart(ctx.rounds, (r) => ctx.standing(t.id, r), roundId).in);
  }

  /** Earlier eliminating rounds' undecided teams, which block opening `roundId`. */
  blockers(ctx: RoundContext, roundId: string) {
    return undecidedBefore(
      ctx.rounds,
      ctx.teams.map((t) => ({ id: t.id, standing: (r: string) => ctx.standing(t.id, r) })),
      roundId,
    ).map((b) => ({
      roundId: b.roundId,
      roundName: ctx.rounds.find((r) => r.id === b.roundId)?.name ?? '',
      teams: b.teamIds.map((id) => {
        const t = ctx.teams.find((x) => x.id === id)!;
        return { id: t.id, teamCode: t.teamCode, name: t.name };
      }),
    }));
  }

  // ── Curator: list / detail ────────────────────────────────────────────────

  async listRounds(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const ctx = await this.context(board.id);
    const [criteria, completed, open] = await Promise.all([
      this.prisma.leaderboardMetric.groupBy({ by: ['roundId'], where: { leaderboardId: board.id }, _count: { _all: true } }),
      this.prisma.hackathonEvalRequest.groupBy({
        by: ['roundId', 'entrantId'],
        where: { leaderboardId: board.id, status: 'COMPLETED' },
        _count: { _all: true },
      }),
      this.prisma.hackathonEvalRequest.groupBy({
        by: ['roundId'],
        where: { leaderboardId: board.id, status: { in: [...OPEN_EVAL_STATUSES] } },
        _count: { _all: true },
      }),
    ]);
    const boardCriteria = criteria.find((c) => c.roundId === null)?._count._all ?? 0;
    return ctx.rounds.map((r) => {
      const inRound = this.teamsInRound(ctx, r.id);
      const need = evaluationsRequired(r);
      const evaluated = inRound.filter(
        (t) => (completed.find((c) => c.roundId === r.id && c.entrantId === t.id)?._count._all ?? 0) >= need,
      ).length;
      return {
        ...this.roundView(r),
        criteria: boardCriteria + (criteria.find((c) => c.roundId === r.id)?._count._all ?? 0),
        teams: inRound.length,
        evaluated,
        inQueue: open.find((o) => o.roundId === r.id)?._count._all ?? 0,
        undecided: r.eliminationEnabled ? inRound.filter((t) => ctx.standing(t.id, r.id) === 'PENDING').length : 0,
      };
    });
  }

  async getRound(userId: string, eventId: string, roundId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const ctx = await this.context(board.id);
    const round = ctx.rounds.find((r) => r.id === roundId);
    if (!round) throw new NotFoundException('Round not found');

    const [metrics, requests, judges, panels] = await Promise.all([
      this.prisma.leaderboardMetric.findMany({
        where: { leaderboardId: board.id, OR: [{ roundId }, { roundId: null }] },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, label: true, minValue: true, maxValue: true, weight: true, roundId: true, _count: { select: { scores: true } } },
      }),
      this.prisma.hackathonEvalRequest.findMany({
        where: { roundId },
        select: { entrantId: true, status: true },
      }),
      this.prisma.leaderboardPanelist.findMany({
        where: {
          leaderboardId: board.id,
          kind: round.kind === 'MENTORING' ? LeaderboardPanelistKind.MENTOR : LeaderboardPanelistKind.JUDGE,
          OR: [{ roundId: null }, { roundId }],
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.hackathonPanel.count({ where: { leaderboardId: board.id, OR: [{ roundId: null }, { roundId }] } }),
    ]);
    const need = evaluationsRequired(round);
    const teams = this.teamsInRound(ctx, roundId).map((t) => {
      const mine = requests.filter((r) => r.entrantId === t.id);
      const done = mine.filter((r) => r.status === 'COMPLETED').length;
      const open = mine.find((r) => (OPEN_EVAL_STATUSES as readonly string[]).includes(r.status));
      return {
        id: t.id,
        teamCode: t.teamCode,
        name: t.name,
        standing: ctx.standing(t.id, roundId),
        evaluations: done,
        required: need,
        queueStatus: open?.status ?? null,
      };
    });
    return {
      ...this.roundView(round),
      criteria: metrics.map((m) => ({
        id: m.id,
        label: m.label,
        maxValue: Number(m.maxValue),
        weight: Number(m.weight),
        allRounds: m.roundId === null,
        marked: m._count.scores > 0,
      })),
      teams,
      // Judges for an evaluation round, mentors for a mentoring one.
      judges: judges.length,
      panels: round.kind === 'MENTORING' ? 0 : panels,
      // Opening is refused until these are decided (only matters while PENDING/CLOSED).
      blockers: round.status === 'ACTIVE' ? [] : this.blockers(ctx, roundId),
      openRequests: requests.filter((r) => (OPEN_EVAL_STATUSES as readonly string[]).includes(r.status)).length,
    };
  }

  private roundView(r: RoundContext['rounds'][number]) {
    return {
      id: r.id,
      name: r.name,
      order: r.order,
      status: r.status,
      kind: r.kind,
      judgingMode: r.judgingMode,
      requiredEvaluations: r.requiredEvaluations,
      slotMinutes: r.slotMinutes,
      callGraceMinutes: r.callGraceMinutes,
      eliminationEnabled: r.eliminationEnabled,
      countsTowardTotal: r.countsTowardTotal,
      endAt: r.endAt,
      submissionsCloseAt: r.submissionsCloseAt,
    };
  }

  // ── Curator: create / edit / delete ───────────────────────────────────────

  async createRound(userId: string, eventId: string, dto: CreateHackathonRoundDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    await this.teams.getBoardOrThrow(eventId);
    if (!dto.name?.trim()) throw new BadRequestException('Name the round, like "Round 2" or "Finals".');
    const data = this.configData(dto, { kind: 'EVALUATION', judgingMode: 'SINGLE', requiredEvaluations: 1 });
    // Creates the round with a PENDING standing for every team.
    const round = await this.leaderboard.createRound(userId, eventId, { name: dto.name.trim() });
    await this.prisma.leaderboardRound.update({ where: { id: round.id }, data });
    return this.getRound(userId, eventId, round.id);
  }

  async updateRound(userId: string, eventId: string, roundId: string, dto: UpdateHackathonRoundDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const round = await this.findRoundOrThrow(board.id, roundId);
    if (dto.judgingMode !== undefined && dto.judgingMode !== round.judgingMode) {
      const open = await this.prisma.hackathonEvalRequest.count({ where: { roundId, status: { in: [...OPEN_EVAL_STATUSES] } } });
      if (open) throw new BadRequestException('Teams are in this round’s queues. Change how it’s judged once they’re through.');
    }
    if (dto.kind !== undefined && dto.kind !== round.kind) {
      const [requests, judgments] = await Promise.all([
        this.prisma.hackathonEvalRequest.count({ where: { roundId } }),
        this.prisma.leaderboardJudgment.count({ where: { roundId } }),
      ]);
      if (requests || judgments) {
        throw new BadRequestException('Teams already had sessions in this round, so it can’t switch between judging and mentoring.');
      }
    }
    const data = this.configData(dto, round);
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Name the round.');
      data.name = dto.name.trim();
    }
    await this.prisma.leaderboardRound.update({ where: { id: roundId }, data });
    this.gateway.hackathonChanged(eventId);
    return this.getRound(userId, eventId, roundId);
  }

  /** Validated settings to write; `current` fills what the DTO leaves out for the cross-field check. */
  private configData(
    dto: UpdateHackathonRoundDto,
    current: { kind: 'EVALUATION' | 'MENTORING'; judgingMode: 'SINGLE' | 'PANEL' | 'MULTI'; requiredEvaluations: number },
  ): Prisma.LeaderboardRoundUpdateInput {
    const kind = dto.kind ?? current.kind;
    let judgingMode = dto.judgingMode ?? current.judgingMode;
    let requiredEvaluations = dto.requiredEvaluations ?? current.requiredEvaluations;
    if (kind === 'MENTORING') {
      // Mentors see teams one at a time; "sessions per team" rides on requiredEvaluations.
      if (dto.judgingMode === undefined) judgingMode = 'SINGLE';
    } else {
      // Switching to several judges starts at 2; away from it, back to 1.
      if (dto.judgingMode === 'MULTI' && dto.requiredEvaluations === undefined && requiredEvaluations < 2) requiredEvaluations = 2;
      if (judgingMode !== 'MULTI') requiredEvaluations = 1;
    }
    const err = roundConfigError({ kind, judgingMode, requiredEvaluations });
    if (err) throw new BadRequestException(err);
    return {
      kind,
      judgingMode,
      requiredEvaluations,
      // Mentoring never eliminates and never counts toward a total.
      ...(kind === 'MENTORING' ? { eliminationEnabled: false, countsTowardTotal: false } : {}),
      ...(dto.submissionsCloseAt !== undefined ? { submissionsCloseAt: dto.submissionsCloseAt ? new Date(dto.submissionsCloseAt) : null } : {}),
      ...(dto.slotMinutes !== undefined ? { slotMinutes: dto.slotMinutes } : {}),
      ...(dto.callGraceMinutes !== undefined ? { callGraceMinutes: dto.callGraceMinutes } : {}),
      ...(kind !== 'MENTORING' && dto.eliminationEnabled !== undefined ? { eliminationEnabled: dto.eliminationEnabled } : {}),
      ...(kind !== 'MENTORING' && dto.countsTowardTotal !== undefined ? { countsTowardTotal: dto.countsTowardTotal } : {}),
      ...(dto.endAt !== undefined ? { endAt: dto.endAt ? new Date(dto.endAt) : null } : {}),
    };
  }

  /** Only a round nobody has been queued or marked in, and not while it's open. */
  async deleteRound(userId: string, eventId: string, roundId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const round = await this.findRoundOrThrow(board.id, roundId);
    if (round.status === 'ACTIVE') throw new BadRequestException('Close the round before deleting it.');
    const [requests, judgments] = await Promise.all([
      this.prisma.hackathonEvalRequest.count({ where: { roundId } }),
      this.prisma.leaderboardJudgment.count({ where: { roundId } }),
    ]);
    if (requests || judgments) {
      throw new BadRequestException('Teams were already evaluated in this round, so it stays on record.');
    }
    return this.leaderboard.deleteRound(userId, eventId, roundId);
  }

  // ── Curator: open / pause / close ─────────────────────────────────────────

  /**
   * Open, pause or close a round. Opening is refused while any team in an
   * earlier round that eliminates is still undecided, or before the round has
   * criteria; eligible teams and the round's judges are told. Pausing or
   * closing cancels every open request in the round (a running slot too), and
   * the teams in it are told.
   */
  async setStatus(userId: string, eventId: string, roundId: string, dto: SetHackathonRoundStatusDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    if (!board.enabled) throw new BadRequestException('Turn hackathon mode on first.');
    await this.teams.syncCancellations(board.id);
    const round = await this.findRoundOrThrow(board.id, roundId);
    if (round.status === dto.status) return this.getRound(userId, eventId, roundId);
    this.leaderboard.assertRoundTransition(round.status, dto.status);
    const ctx = await this.context(board.id);

    if (dto.status === 'ACTIVE') {
      const blockers = this.blockers(ctx, roundId);
      if (blockers.length) {
        const b = blockers[0];
        const codes = b.teams.slice(0, 5).map((t) => t.teamCode ?? t.name).join(', ');
        const more = b.teams.length > 5 ? ` and ${b.teams.length - 5} more` : '';
        throw new ConflictException(
          `Advance or eliminate every team in ${b.roundName} first. Still undecided: ${codes}${more}.`,
        );
      }
      if (round.kind === 'EVALUATION') {
        const criteria = await this.prisma.leaderboardMetric.count({
          where: { leaderboardId: board.id, OR: [{ roundId }, { roundId: null }] },
        });
        if (!criteria) throw new BadRequestException('Add the criteria judges mark against before opening the round.');
      }
    }

    const now = new Date();
    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.leaderboardRound.update({ where: { id: roundId }, data: { status: dto.status } });
      if (dto.status === 'ACTIVE') return [];
      const open = await tx.hackathonEvalRequest.findMany({
        where: { roundId, status: { in: [...OPEN_EVAL_STATUSES] } },
        select: { id: true, entrantId: true, judgeUserId: true, panel: { select: { members: { select: { userId: true } } } } },
      });
      if (open.length) {
        await tx.hackathonEvalRequest.updateMany({
          where: { id: { in: open.map((r) => r.id) } },
          data: {
            status: 'CANCELLED',
            closedAt: now,
            closedBy: userId,
            closedReason: dto.status === 'CLOSED' ? 'ROUND_CLOSED' : 'ROUND_PAUSED',
          },
        });
      }
      return open;
    });

    await this.leaderboard.recomputeAndBroadcast(board.id);
    const inRound = this.teamsInRound(ctx, roundId);
    const judgeIds = await this.roundJudgeIds(board.id, roundId, round.kind);
    this.gateway.hackathonChanged(eventId, {
      judgeUserIds: [
        ...judgeIds,
        ...cancelled.flatMap((r) => [r.judgeUserId, ...(r.panel?.members.map((m) => m.userId) ?? [])]).filter((id): id is string => !!id),
      ],
      entrantIds: inRound.map((t) => t.id),
    });

    const extra = { roundName: round.name };
    if (dto.status === 'ACTIVE') {
      const pending = inRound.filter((t) => ctx.standing(t.id, roundId) === 'PENDING');
      await this.teams.notify(eventId, pending, 'ROUND_OPENED', extra);
      await this.judges.notifyJudges(eventId, judgeIds, 'ROUND_OPENED', extra);
    } else if (dto.status === 'CLOSED') {
      await this.teams.notify(eventId, inRound, 'ROUND_CLOSED', extra);
      await this.judges.notifyJudges(eventId, judgeIds, 'ROUND_CLOSED', extra);
    } else if (cancelled.length) {
      // Paused: only the teams that lost their place hear about it.
      const ids = new Set(cancelled.map((r) => r.entrantId));
      await this.teams.notify(eventId, inRound.filter((t) => ids.has(t.id)), 'QUEUE_REMOVED', extra);
    }
    return this.getRound(userId, eventId, roundId);
  }

  /** Judges who judge this round, alone or on a panel for it; mentors for a mentoring round. */
  async roundJudgeIds(leaderboardId: string, roundId: string, kind: 'EVALUATION' | 'MENTORING' = 'EVALUATION'): Promise<string[]> {
    const [solo, panel] = await Promise.all([
      this.prisma.leaderboardPanelist.findMany({
        where: {
          leaderboardId,
          kind: kind === 'MENTORING' ? LeaderboardPanelistKind.MENTOR : LeaderboardPanelistKind.JUDGE,
          OR: [{ roundId: null }, { roundId }],
        },
        select: { userId: true },
      }),
      kind === 'MENTORING'
        ? Promise.resolve([] as { userId: string }[])
        : this.prisma.hackathonPanelMember.findMany({
            where: { panel: { leaderboardId, OR: [{ roundId: null }, { roundId }] } },
            select: { userId: true },
          }),
    ]);
    return [...new Set([...solo, ...panel].map((r) => r.userId))];
  }

  // ── Curator: advance / eliminate ──────────────────────────────────────────

  async setTeamDecision(userId: string, eventId: string, roundId: string, entrantId: string, dto: SetTeamRoundDecisionDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const round = await this.findRoundOrThrow(board.id, roundId);
    if (!round.eliminationEnabled) {
      throw new BadRequestException('This round doesn’t eliminate: every team goes on to the next one.');
    }
    const ctx = await this.context(board.id);
    if (!this.teamsInRound(ctx, roundId).some((t) => t.id === entrantId)) {
      throw new BadRequestException('That team isn’t in this round.');
    }
    await this.leaderboard.setEntrantRoundStatus(userId, eventId, entrantId, { roundId, status: dto.status });
    this.gateway.hackathonChanged(eventId, { entrantIds: [entrantId] });
    return this.getRound(userId, eventId, roundId);
  }

  /**
   * Advance / eliminate many teams at once (the app's "top N" helper). One
   * write, one ranking recompute; eliminated teams leave any queue; each team
   * whose decision changed is told.
   */
  async setDecisions(userId: string, eventId: string, roundId: string, dto: SetRoundDecisionsDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const round = await this.findRoundOrThrow(board.id, roundId);
    if (!round.eliminationEnabled) {
      throw new BadRequestException('This round doesn’t eliminate: every team goes on to the next one.');
    }
    await this.teams.syncCancellations(board.id);
    const ctx = await this.context(board.id);
    const inRound = new Map(this.teamsInRound(ctx, roundId).map((t) => [t.id, t]));
    const decisions = new Map(dto.decisions.map((d) => [d.entrantId, d.status]));
    const outside = [...decisions.keys()].find((id) => !inRound.has(id));
    if (outside) throw new BadRequestException('One of those teams isn’t in this round.');

    const changed = [...decisions].filter(([id, status]) => ctx.standing(id, roundId) !== status);
    if (!changed.length) return this.getRound(userId, eventId, roundId);
    const now = new Date();
    const eliminated = changed.filter(([, s]) => s === 'ELIMINATED').map(([id]) => id);
    const open = eliminated.length
      ? await this.prisma.hackathonEvalRequest.findMany({
          where: { entrantId: { in: eliminated }, status: { in: [...OPEN_EVAL_STATUSES] } },
          select: { judgeUserId: true, panel: { select: { members: { select: { userId: true } } } } },
        })
      : [];
    await this.prisma.$transaction([
      ...changed.map(([entrantId, status]) =>
        this.prisma.leaderboardEntrantRound.upsert({
          where: { entrantId_roundId: { entrantId, roundId } },
          create: {
            entrantId,
            roundId,
            status,
            ...(status === 'PENDING' ? {} : { decidedBy: userId, decidedAt: now }),
          },
          update: {
            status,
            ...(status === 'PENDING' ? { decidedBy: null, decidedAt: null } : { decidedBy: userId, decidedAt: now }),
          },
        }),
      ),
      this.prisma.hackathonEvalRequest.updateMany({
        where: { entrantId: { in: eliminated }, status: { in: [...OPEN_EVAL_STATUSES] } },
        data: { status: 'CANCELLED', closedAt: now, closedReason: 'ELIMINATED', closedBy: userId },
      }),
    ]);
    await this.leaderboard.recomputeAndBroadcast(board.id);
    this.gateway.hackathonChanged(eventId, {
      entrantIds: changed.map(([id]) => id),
      judgeUserIds: open
        .flatMap((r) => [r.judgeUserId, ...(r.panel?.members.map((m) => m.userId) ?? [])])
        .filter((id): id is string => !!id),
    });
    for (const status of ['ADVANCED', 'ELIMINATED'] as const) {
      const teams = changed.filter(([, s]) => s === status).map(([id]) => ({ id, name: inRound.get(id)!.name }));
      if (teams.length) await this.leaderboard.notifyTeams(eventId, teams, { kind: status, label: round.name });
    }
    return this.getRound(userId, eventId, roundId);
  }

  // ── Curator: criteria ─────────────────────────────────────────────────────

  /**
   * Add a criterion to the round, or change one. Marks already given are kept,
   * so a new maximum can't go below the highest mark given against it.
   */
  async upsertCriterion(userId: string, eventId: string, roundId: string, metricId: string | null, dto: UpsertCriterionDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.findRoundOrThrow(board.id, roundId);
    const label = dto.label.replace(/\s+/g, ' ').trim();
    if (!label) throw new BadRequestException('Name the criterion, like "Innovation".');

    if (metricId) {
      const metric = await this.prisma.leaderboardMetric.findFirst({ where: { id: metricId, leaderboardId: board.id } });
      if (!metric) throw new NotFoundException('Criterion not found');
      if (metric.roundId !== null && metric.roundId !== roundId) throw new BadRequestException('That criterion belongs to another round.');
      const top = await this.prisma.leaderboardScore.aggregate({ where: { metricId }, _max: { value: true } });
      const highest = top._max.value != null ? Number(top._max.value) : null;
      if (highest != null && dto.maxValue < highest) {
        throw new BadRequestException(`A judge already gave ${highest} for ${metric.label}. The maximum can't go below that.`);
      }
      await this.prisma.leaderboardMetric.update({
        where: { id: metricId },
        data: { label, maxValue: dto.maxValue, ...(dto.weight !== undefined ? { weight: dto.weight } : {}) },
      });
    } else {
      const existing = await this.prisma.leaderboardMetric.findMany({
        where: { leaderboardId: board.id },
        select: { key: true, displayOrder: true },
      });
      const key = criterionKey(label, new Set(existing.map((m) => m.key)));
      try {
        await this.prisma.leaderboardMetric.create({
          data: {
            leaderboardId: board.id,
            roundId,
            key,
            label,
            minValue: 0,
            maxValue: dto.maxValue,
            weight: dto.weight ?? 1,
            displayOrder: existing.reduce((max, m) => Math.max(max, m.displayOrder + 1), 0),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Two curators added the same label at once: take a random suffix.
          await this.prisma.leaderboardMetric.create({
            data: { leaderboardId: board.id, roundId, key: `${key}-${crypto.randomBytes(2).toString('hex')}`, label, minValue: 0, maxValue: dto.maxValue, weight: dto.weight ?? 1 },
          });
        } else {
          throw err;
        }
      }
    }
    await this.leaderboard.recomputeAndBroadcast(board.id);
    return this.getRound(userId, eventId, roundId);
  }

  async deleteCriterion(userId: string, eventId: string, roundId: string, metricId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.findRoundOrThrow(board.id, roundId);
    const metric = await this.prisma.leaderboardMetric.findFirst({
      where: { id: metricId, leaderboardId: board.id },
      select: { id: true, label: true, _count: { select: { scores: true } } },
    });
    if (!metric) throw new NotFoundException('Criterion not found');
    if (metric._count.scores) throw new BadRequestException(`Judges already gave marks for ${metric.label}, so it stays.`);
    await this.prisma.leaderboardMetric.delete({ where: { id: metricId } });
    await this.leaderboard.recomputeAndBroadcast(board.id);
    return this.getRound(userId, eventId, roundId);
  }

  async findRoundOrThrow(leaderboardId: string, roundId: string) {
    const round = await this.prisma.leaderboardRound.findFirst({ where: { id: roundId, leaderboardId } });
    if (!round) throw new NotFoundException('Round not found');
    return round;
  }
}
