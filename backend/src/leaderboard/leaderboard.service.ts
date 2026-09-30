import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  LeaderboardEntrantRoundStatus,
  LeaderboardPanelistKind,
  LeaderboardRoundStatus,
  Prisma,
  Provider,
  RoleCode,
} from '@prisma/client';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { CompetitionUpdateEvent } from '../notifications/notifications.events';
import { PrismaService } from '../prisma/prisma.service';
import { NOT_DELETED } from '../common/soft-delete';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { Action, AuthorizationService } from '../auth/authorization';
import { PlanConfigService } from '../subscription/plan-config.service';
import { LeaderboardGateway } from './leaderboard.gateway';
import {
  AssignJudgeDto,
  AssignPanelistDto,
  CreateAwardDto,
  CreateEntrantDto,
  CreateLeaderboardDto,
  CreateRoundDto,
  ReorderRoundsDto,
  SetAwardPublishedDto,
  SetEntrantRoundStatusDto,
  SetRoundStatusDto,
  SubmitJudgmentDto,
  SubmitScoresDto,
  UpdateAwardDto,
  UpdateEntrantDto,
  UpdateLeaderboardDto,
  UpdateRoundDto,
  UpsertMetricDto,
} from './dto';
import {
  EntrantInput,
  MetricDef,
  RankMode,
  rankEntrants,
} from './ranking';
import { hackathonRooms } from './leaderboard.gateway';
import {
  OPEN_EVAL_STATUSES,
  SLOT_EVAL_STATUSES,
  editableUntil,
  effectiveStatus,
  judgmentLocked,
} from './hackathon.shared';
import { TEAM_STATEMENT_SELECT, statementView } from './hackathon.views';

/** The event-scoped role a panel kind maps to (grants app access + mobile section). */
const PANELIST_ROLE: Record<LeaderboardPanelistKind, RoleCode> = {
  JUDGE: RoleCode.JUDGE,
  MENTOR: RoleCode.MENTOR,
};

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly authz: AuthorizationService,
    @Inject(forwardRef(() => LeaderboardGateway))
    private readonly gateway: LeaderboardGateway,
    private readonly events: EventEmitter2,
  ) {}

  // ── Authorization ────────────────────────────────────────────────────────

  /**
   * Board / round / panel / entrant / award management is gated by the
   * `event:manage-leaderboard` capability (Space Admin / Curator / Co-Curator,
   * plus Platform Admin by inheritance). Panelists are authorized separately, by
   * their assignment — never by this capability.
   */
  async assertCanManage(userId: string, eventId: string): Promise<void> {
    await this.authz.assertCan({ id: userId }, Action.EVENT_MANAGE_LEADERBOARD, {
      eventId,
    });
  }

  private async isEventManager(userId: string, eventId: string): Promise<boolean> {
    return this.authz.can({ id: userId }, Action.EVENT_MANAGE_LEADERBOARD, {
      eventId,
    });
  }

  /**
   * May this user act as a panelist (or manager) for viewing purposes? Used only
   * by the public `canView` gate to let assigned judges/mentors see a DRAFT board.
   */
  private async isEventPanelistOrManager(
    userId: string,
    eventId: string,
  ): Promise<boolean> {
    if (await this.isEventManager(userId, eventId)) return true;
    const role = await this.prisma.userRole.count({
      where: {
        userId,
        eventId,
        role: { code: { in: [RoleCode.JUDGE, RoleCode.MENTOR] } },
      },
    });
    return role > 0;
  }

  /**
   * Rejects when the event's space owner's plan does not include the dashboard.
   * Mirrors Sessions: the plan checked is the space *creator's*, and a missing
   * subscription is left alone rather than locking a not-yet-billed space out.
   */
  async assertPlanAllows(eventId: string) {
    if (!(await this.planAllows(eventId))) {
      throw new ForbiddenException(
        'The competitive dashboard is not included in this plan. Ask an admin to enable it.',
      );
    }
  }

  /** Non-throwing form of {@link assertPlanAllows}, for screens that explain the gate. */
  async planAllows(eventId: string): Promise<boolean> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { space: { select: { subscription: true } } },
    });
    const subscription = event?.space?.subscription;
    if (!subscription) return true;
    return this.planConfig.getEffectiveLimits(subscription).hasLeaderboard;
  }

  private assertRubric(mode: string) {
    if (mode !== 'RUBRIC') {
      throw new BadRequestException(
        'Panels, reviews and mentors apply to RUBRIC boards only.',
      );
    }
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * ROUND STATUS TRANSITION POLICY — a genuine product decision.
   * ───────────────────────────────────────────────────────────────────────────
   * Round status drives the SERVER-SIDE privacy boundary: while a round is
   * ACTIVE panelists may read + write their own cells; once CLOSED their reads
   * are locked out entirely. So "can a CLOSED round be re-opened to ACTIVE?" is
   * not cosmetic — it re-exposes panelist data that was deliberately sealed.
   *
   * DEFAULT below: allow the natural forward flow (PENDING→ACTIVE→CLOSED), allow
   * pausing (ACTIVE→PENDING), and ALLOW reopening (CLOSED→ACTIVE) so a curator
   * can fix a premature close. The only forbidden move is CLOSED→PENDING
   * (un-closing to "not started" is meaningless). Tighten `CLOSED: [...]` to
   * `[]` if reopening should be forbidden for privacy.
   */
  assertRoundTransition(
    from: LeaderboardRoundStatus,
    to: LeaderboardRoundStatus,
  ) {
    if (from === to) return; // no-op is always fine
    const allowed: Record<LeaderboardRoundStatus, LeaderboardRoundStatus[]> = {
      PENDING: ['ACTIVE', 'CLOSED'],
      ACTIVE: ['PENDING', 'CLOSED'],
      CLOSED: ['ACTIVE'],
    };
    if (!allowed[from].includes(to)) {
      throw new BadRequestException(
        `Cannot move a round from ${from} to ${to}.`,
      );
    }
  }

  // ── Board lifecycle ───────────────────────────────────────────────────────

  async createForEvent(userId: string, eventId: string, dto: CreateLeaderboardDto) {
    await this.assertCanManage(userId, eventId);
    await this.assertPlanAllows(eventId);

    const existing = await this.prisma.leaderboard.findUnique({ where: { eventId } });
    if (existing) {
      throw new BadRequestException('This event already has a leaderboard');
    }

    const board = await this.prisma.leaderboard.create({
      data: {
        eventId,
        mode: dto.mode,
        entrantKind: dto.entrantKind,
        visibility: dto.visibility,
        title: dto.title,
        description: dto.description,
        tieBreak: dto.tieBreak,
        tieBreakMetricId: dto.tieBreakMetricId,
        createdBy: userId,
      },
    });
    // A board always has at least one round, so scoring code never special-cases
    // "no round". The implicit first round is ACTIVE so it is scoreable at once.
    await this.ensureDefaultRound(board.id);
    return board;
  }

  async updateForEvent(userId: string, eventId: string, dto: UpdateLeaderboardDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    // Enabling the board is the moment we re-check the plan gate.
    if (dto.enabled === true) await this.assertPlanAllows(eventId);
    const updated = await this.prisma.leaderboard.update({
      where: { id: board.id },
      data: dto,
    });
    // Revealing/hiding feedback or flipping status changes what participants see.
    await this.recomputeAndBroadcast(board.id);
    if (dto.revealReviews === true && !board.revealReviews && updated.status !== 'DRAFT') {
      await this.notifyFeedbackRevealed(board.id, eventId);
    }
    return updated;
  }

  private async getBoardByEventOrThrow(eventId: string) {
    const board = await this.prisma.leaderboard.findUnique({ where: { eventId } });
    if (!board) throw new NotFoundException('This event has no leaderboard');
    return board;
  }

  /** Materialise a "Round 1" (ACTIVE) if the board has no rounds yet. */
  private async ensureDefaultRound(leaderboardId: string) {
    const count = await this.prisma.leaderboardRound.count({ where: { leaderboardId } });
    if (count > 0) return;
    await this.prisma.leaderboardRound.create({
      data: {
        leaderboardId,
        name: 'Round 1',
        order: 1,
        status: LeaderboardRoundStatus.ACTIVE,
      },
    });
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  async upsertMetric(userId: string, eventId: string, dto: UpsertMetricDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    if (dto.roundId) await this.getRoundOrThrow(board.id, dto.roundId);

    const metric = await this.prisma.leaderboardMetric.upsert({
      where: { leaderboardId_key: { leaderboardId: board.id, key: dto.key } },
      create: { leaderboardId: board.id, ...dto },
      update: dto,
    });
    // A single primary metric PER ROUND SCOPE: demote any other primary that
    // shares this metric's round scope (null = board-level is its own scope).
    if (dto.isPrimary) {
      await this.prisma.leaderboardMetric.updateMany({
        where: {
          leaderboardId: board.id,
          id: { not: metric.id },
          roundId: metric.roundId,
        },
        data: { isPrimary: false },
      });
    }
    await this.recomputeAndBroadcast(board.id);
    return metric;
  }

  async deleteMetric(userId: string, eventId: string, metricId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    await this.prisma.leaderboardMetric.delete({
      where: { id: metricId, leaderboardId: board.id },
    });
    await this.recomputeAndBroadcast(board.id);
    return { ok: true };
  }

  // ── Entrants ──────────────────────────────────────────────────────────────

  async createEntrant(userId: string, eventId: string, dto: CreateEntrantDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    await this.assertRegistrationOnEvent(eventId, dto.registrationId);
    const entrant = await this.prisma.leaderboardEntrant.create({
      data: {
        leaderboardId: board.id,
        name: dto.name,
        registrationId: dto.registrationId,
        userId: dto.userId,
        meta: dto.meta as Prisma.InputJsonValue,
      },
    });
    // Give the entrant a standing (PENDING) in every existing round so the
    // bracket and completion matrix have a row to render immediately.
    const rounds = await this.prisma.leaderboardRound.findMany({
      where: { leaderboardId: board.id },
      select: { id: true },
    });
    if (rounds.length) {
      await this.prisma.leaderboardEntrantRound.createMany({
        data: rounds.map((r) => ({ entrantId: entrant.id, roundId: r.id })),
        skipDuplicates: true,
      });
    }
    return entrant;
  }

  async updateEntrant(userId: string, eventId: string, entrantId: string, dto: UpdateEntrantDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    await this.assertRegistrationOnEvent(eventId, dto.registrationId);
    return this.prisma.leaderboardEntrant.update({
      where: { id: entrantId, leaderboardId: board.id },
      data: { ...dto, meta: dto.meta as Prisma.InputJsonValue },
    });
  }

  /** A linked registration must be for this event (its team gets this board's pushes). */
  private async assertRegistrationOnEvent(eventId: string, registrationId?: string | null) {
    if (!registrationId) return;
    const reg = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: { id: true },
    });
    if (!reg) throw new BadRequestException('That registration is not for this event');
  }

  /**
   * Confirmed registrations a curator can link an entrant to, so the team's
   * members see their standing and get pushes. Searches the booker's name,
   * username and email; a group booking links its whole claimed roster.
   */
  async searchRegistrants(userId: string, eventId: string, q: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    const term = q.trim();
    const regs = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        ...COUNTS_AS_ATTENDING,
        ...(term
          ? {
              user: {
                OR: [
                  { fullName: { contains: term, mode: 'insensitive' } },
                  { username: { contains: term, mode: 'insensitive' } },
                  { identities: { some: { email: { contains: term, mode: 'insensitive' } } } },
                ],
              },
            }
          : {}),
      },
      orderBy: { registeredAt: 'desc' },
      take: 20,
      select: {
        id: true,
        groupSize: true,
        user: {
          select: {
            fullName: true,
            username: true,
            identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
          },
        },
      },
    });
    const linked = await this.prisma.leaderboardEntrant.findMany({
      where: { leaderboardId: board.id, registrationId: { in: regs.map((r) => r.id) } },
      select: { registrationId: true, name: true },
    });
    return regs.map((r) => ({
      registrationId: r.id,
      name: r.user.fullName || r.user.username || 'Attendee',
      email: r.user.identities[0]?.email ?? null,
      groupSize: r.groupSize ?? null,
      linkedTo: linked.find((l) => l.registrationId === r.id)?.name ?? null,
    }));
  }

  async deleteEntrant(userId: string, eventId: string, entrantId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    await this.prisma.leaderboardEntrant.delete({
      where: { id: entrantId, leaderboardId: board.id },
    });
    await this.recomputeAndBroadcast(board.id);
    return { ok: true };
  }

  // ── Rounds ──────────────────────────────────────────────────────────────

  private async getRoundOrThrow(leaderboardId: string, roundId: string) {
    const round = await this.prisma.leaderboardRound.findFirst({
      where: { id: roundId, leaderboardId },
    });
    if (!round) throw new NotFoundException('Round not found on this board');
    return round;
  }

  async listRounds(userId: string, eventId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    return this.prisma.leaderboardRound.findMany({
      where: { leaderboardId: board.id },
      orderBy: { order: 'asc' },
    });
  }

  async createRound(userId: string, eventId: string, dto: CreateRoundDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    const last = await this.prisma.leaderboardRound.findFirst({
      where: { leaderboardId: board.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const order = dto.order ?? (last ? last.order + 1 : 1);

    const round = await this.prisma.leaderboardRound.create({
      data: { leaderboardId: board.id, name: dto.name, order },
    });
    // Seed a PENDING standing for every entrant in the new round.
    const entrants = await this.prisma.leaderboardEntrant.findMany({
      where: { leaderboardId: board.id },
      select: { id: true },
    });
    if (entrants.length) {
      await this.prisma.leaderboardEntrantRound.createMany({
        data: entrants.map((e) => ({ entrantId: e.id, roundId: round.id })),
        skipDuplicates: true,
      });
    }
    return round;
  }

  async updateRound(
    userId: string,
    eventId: string,
    roundId: string,
    dto: UpdateRoundDto,
  ) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    await this.getRoundOrThrow(board.id, roundId);
    return this.prisma.leaderboardRound.update({
      where: { id: roundId },
      data: { name: dto.name },
    });
  }

  async reorderRounds(userId: string, eventId: string, dto: ReorderRoundsDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    const rounds = await this.prisma.leaderboardRound.findMany({
      where: { leaderboardId: board.id },
      select: { id: true },
    });
    const known = new Set(rounds.map((r) => r.id));
    if (dto.roundIds.length !== rounds.length || dto.roundIds.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'roundIds must list exactly the rounds on this board.',
      );
    }
    // Two-phase to dodge the (leaderboardId, order) unique constraint: park every
    // round at a high, collision-free order first, then lay down the final order.
    await this.prisma.$transaction([
      ...dto.roundIds.map((id, i) =>
        this.prisma.leaderboardRound.update({
          where: { id },
          data: { order: 1000 + i },
        }),
      ),
      ...dto.roundIds.map((id, i) =>
        this.prisma.leaderboardRound.update({
          where: { id },
          data: { order: i + 1 },
        }),
      ),
    ]);
    await this.recomputeAndBroadcast(board.id);
    return this.listRounds(userId, eventId);
  }

  async setRoundStatus(
    userId: string,
    eventId: string,
    roundId: string,
    dto: SetRoundStatusDto,
  ) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    if (board.isHackathon) {
      // Opening a hackathon round checks undecided teams, and closing one
      // cancels its queues: that lives in HackathonRoundsService.
      throw new BadRequestException('Open and close hackathon rounds from the hackathon screen in the Unifesto app.');
    }
    const round = await this.getRoundOrThrow(board.id, roundId);
    this.assertRoundTransition(round.status, dto.status);
    const updated = await this.prisma.leaderboardRound.update({
      where: { id: roundId },
      data: { status: dto.status },
    });
    await this.recomputeAndBroadcast(board.id);
    return updated;
  }

  async deleteRound(userId: string, eventId: string, roundId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    await this.getRoundOrThrow(board.id, roundId);
    const count = await this.prisma.leaderboardRound.count({
      where: { leaderboardId: board.id },
    });
    if (count <= 1) {
      throw new BadRequestException('A board must keep at least one round.');
    }
    await this.prisma.leaderboardRound.delete({ where: { id: roundId } });
    await this.recomputeAndBroadcast(board.id);
    return { ok: true };
  }

  // ── Panelists (judges / mentors) ────────────────────────────────────────

  async listPanelists(userId: string, eventId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    const panelists = await this.prisma.leaderboardPanelist.findMany({
      where: { leaderboardId: board.id },
      orderBy: { createdAt: 'asc' },
    });
    // userId is a soft ref (no FK) — hydrate the display fields in one query.
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(panelists.map((p) => p.userId))] } },
      select: { id: true, fullName: true, username: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return panelists.map((p) => ({ ...p, user: byId.get(p.userId) ?? null }));
  }

  async assignPanelist(userId: string, eventId: string, dto: AssignPanelistDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    this.assertRubric(board.mode);

    // Resolve the target account: an explicit id, or find-or-create by email.
    let targetUserId = dto.userId ?? null;
    if (!targetUserId) {
      if (!dto.email) {
        throw new BadRequestException('Provide either a userId or an email.');
      }
      targetUserId = await this.findOrCreateUserByEmail(dto.email, dto.name ?? '');
    }

    if (dto.roundId) await this.getRoundOrThrow(board.id, dto.roundId);
    if (dto.entrantId) {
      const entrant = await this.prisma.leaderboardEntrant.findFirst({
        where: { id: dto.entrantId, leaderboardId: board.id },
        select: { id: true },
      });
      if (!entrant) throw new NotFoundException('Entrant not found on this board');
    }

    // The compound unique includes nullable round/entrant, which Postgres treats
    // as distinct when null — find-or-create keeps assignment idempotent.
    const existing = await this.prisma.leaderboardPanelist.findFirst({
      where: {
        leaderboardId: board.id,
        userId: targetUserId,
        kind: dto.kind,
        roundId: dto.roundId ?? null,
        entrantId: dto.entrantId ?? null,
      },
    });
    const panelist =
      existing ??
      (await this.prisma.leaderboardPanelist.create({
        data: {
          leaderboardId: board.id,
          userId: targetUserId,
          kind: dto.kind,
          roundId: dto.roundId ?? null,
          entrantId: dto.entrantId ?? null,
        },
      }));

    // Grant the event-scoped role that unlocks app access + the mobile "Judging"
    // section. The panelist row scopes WHICH rounds/entrants; this only grants
    // access. Idempotent (the compound unique can't dedupe an event-scoped role).
    await this.grantPanelistRole(targetUserId, eventId, dto.kind, userId);

    return panelist;
  }

  async removePanelist(userId: string, eventId: string, panelistId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    const panelist = await this.prisma.leaderboardPanelist.findFirst({
      where: { id: panelistId, leaderboardId: board.id },
    });
    if (!panelist) throw new NotFoundException('Panelist assignment not found');

    await this.prisma.leaderboardPanelist.delete({ where: { id: panelistId } });

    // If this user holds no other panelist rows of the same kind on this board,
    // revoke the event-scoped role so they lose access + the mobile section.
    const remaining = await this.prisma.leaderboardPanelist.count({
      where: { leaderboardId: board.id, userId: panelist.userId, kind: panelist.kind },
    });
    if (remaining === 0) {
      const role = await this.prisma.role.findUnique({
        where: { code: PANELIST_ROLE[panelist.kind] },
        select: { id: true },
      });
      if (role) {
        await this.prisma.userRole.deleteMany({
          where: { userId: panelist.userId, roleId: role.id, eventId },
        });
      }
    }
    return { ok: true };
  }

  async grantPanelistRole(
    targetUserId: string,
    eventId: string,
    kind: LeaderboardPanelistKind,
    assignedBy: string,
  ) {
    const role = await this.prisma.role.findUnique({
      where: { code: PANELIST_ROLE[kind] },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException(`${PANELIST_ROLE[kind]} role is not seeded`);
    }
    const existing = await this.prisma.userRole.findFirst({
      where: { userId: targetUserId, roleId: role.id, eventId, spaceId: null },
    });
    if (existing) return;
    await this.prisma.userRole.create({
      data: { userId: targetUserId, roleId: role.id, eventId, assignedBy },
    });
  }

  // ── Scoring — METRIC organiser entry ──────────────────────────────────────

  /**
   * METRIC mode only: the organiser enters the one authoritative value per
   * criterion for a round (judge_user_id = null). RUBRIC panelists use
   * {@link submitJudgment}.
   */
  async submitScores(userId: string, entrantId: string, dto: SubmitScoresDto) {
    const entrant = await this.loadEntrantWithBoard(entrantId);
    const board = entrant.leaderboard;
    if (board.mode !== 'METRIC') {
      throw new BadRequestException(
        'submitScores is for METRIC boards. RUBRIC judges submit via the judgment endpoint.',
      );
    }
    await this.assertCanManage(userId, board.eventId);
    const round = await this.getRoundOrThrow(board.id, dto.roundId);
    this.validateScoreCells(board.metrics, dto.scores);

    await this.prisma.$transaction(async (tx) => {
      for (const cell of dto.scores) {
        // Composite unique treats NULLs as distinct, so upsert can't dedupe the
        // organiser cell — the partial unique index does. Find-or-write.
        const existing = await tx.leaderboardScore.findFirst({
          where: { entrantId, metricId: cell.metricId, roundId: round.id, judgeUserId: null },
          select: { id: true },
        });
        if (existing) {
          await tx.leaderboardScore.update({
            where: { id: existing.id },
            data: { value: cell.value, comment: cell.comment, updatedBy: userId },
          });
        } else {
          await tx.leaderboardScore.create({
            data: {
              entrantId,
              metricId: cell.metricId,
              roundId: round.id,
              judgeUserId: null,
              value: cell.value,
              comment: cell.comment,
              updatedBy: userId,
            },
          });
        }
      }
    });

    await this.recomputeAndBroadcast(board.id);
    return { ok: true };
  }

  // ── Scoring / review — RUBRIC panelist path ───────────────────────────────

  /**
   * RUBRIC panelist submission. A JUDGE may write score cells (with per-criterion
   * comments) and an overall review; a MENTOR may write only an overall review.
   * Writes are allowed only while the round is ACTIVE and only within the
   * panelist's assigned scope.
   */
  async submitJudgment(userId: string, entrantId: string, dto: SubmitJudgmentDto) {
    const entrant = await this.loadEntrantWithBoard(entrantId);
    const board = entrant.leaderboard;
    this.assertRubric(board.mode);
    this.assertHackathonTeamOpen(board, entrant);
    const round = await this.getRoundOrThrow(board.id, dto.roundId);

    // Panelists may only write while the round is open.
    if (round.status !== LeaderboardRoundStatus.ACTIVE) {
      throw new ForbiddenException('This round is not open for scoring.');
    }

    const kind = await this.resolvePanelistKind(board.id, userId, round.id, entrantId);
    if (!kind) {
      throw new ForbiddenException('You are not on the panel for this entrant/round.');
    }

    const hasScores = (dto.scores?.length ?? 0) > 0;
    if (hasScores && kind === LeaderboardPanelistKind.MENTOR) {
      throw new ForbiddenException('Mentors submit reviews only, not scores.');
    }
    if (board.isHackathon) {
      return this.submitHackathonJudgment(userId, { id: entrantId, leaderboardId: board.id }, board, round, kind, dto);
    }
    if (hasScores) this.validateScoreCells(board.metrics, dto.scores!);

    await this.prisma.$transaction(async (tx) => {
      if (hasScores) {
        for (const cell of dto.scores!) {
          await tx.leaderboardScore.upsert({
            where: {
              // maps to @@unique([entrantId, metricId, judgeUserId, roundId])
              entrantId_metricId_judgeUserId_roundId: {
                entrantId,
                metricId: cell.metricId,
                judgeUserId: userId,
                roundId: round.id,
              },
            },
            create: {
              entrantId,
              metricId: cell.metricId,
              roundId: round.id,
              judgeUserId: userId,
              value: cell.value,
              comment: cell.comment,
              updatedBy: userId,
            },
            update: { value: cell.value, comment: cell.comment, updatedBy: userId },
          });
        }
      }

      // Upsert the judgment record (the "has reviewed?" source of truth).
      await tx.leaderboardJudgment.upsert({
        where: {
          entrantId_roundId_panelistUserId: {
            entrantId,
            roundId: round.id,
            panelistUserId: userId,
          },
        },
        create: {
          entrantId,
          roundId: round.id,
          panelistUserId: userId,
          kind,
          overallReview: dto.overallReview,
          submittedAt: dto.submit ? new Date() : null,
        },
        update: {
          kind,
          // Only overwrite the review text when the caller supplied one.
          ...(dto.overallReview !== undefined ? { overallReview: dto.overallReview } : {}),
          ...(dto.submit ? { submittedAt: new Date() } : {}),
        },
      });
    });

    await this.recomputeAndBroadcast(board.id);
    return { ok: true };
  }

  /**
   * A judge's marks on a hackathon board (plan §8). Marks go in during the
   * team's slot: the judge (or their panel) must have called and started the
   * team. `submittedAt` is stamped on the FIRST submit only; after it the judge
   * can change their marks for 5 minutes (or 5 minutes after the curator
   * reopens them), then they lock. Submitting needs every criterion of the round.
   * The first submit completes the slot (a PANEL slot once every member has).
   */
  private async submitHackathonJudgment(
    userId: string,
    entrant: { id: string; leaderboardId: string },
    board: { id: string; eventId: string; metrics: { id: string; label: string; roundId: string | null; minValue: Prisma.Decimal; maxValue: Prisma.Decimal }[] },
    round: { id: string },
    kind: LeaderboardPanelistKind,
    dto: SubmitJudgmentDto,
  ) {
    if (kind !== LeaderboardPanelistKind.JUDGE) {
      throw new ForbiddenException('Only judges give marks in this hackathon.');
    }
    const metrics = board.metrics.filter((m) => m.roundId === null || m.roundId === round.id);
    const cells = dto.scores ?? [];
    const inRound = new Set(metrics.map((m) => m.id));
    for (const c of cells) {
      if (!inRound.has(c.metricId)) throw new BadRequestException('That criterion isn’t part of this round.');
    }
    this.validateScoreCells(metrics, cells);
    if (dto.submit) {
      if (!metrics.length) throw new BadRequestException("The organisers haven't set this round's criteria yet.");
      const given = new Set(cells.map((c) => c.metricId));
      const missing = metrics.find((m) => !given.has(m.id));
      if (missing) throw new BadRequestException(`Give a mark for "${missing.label}" before submitting.`);
    }

    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const key = { entrantId: entrant.id, roundId: round.id, panelistUserId: userId };
      const existing = await tx.leaderboardJudgment.findUnique({
        where: { entrantId_roundId_panelistUserId: key },
        select: { submittedAt: true, reopenedAt: true, requestId: true },
      });
      let slot: { id: string; panelId: string | null } | null = null;
      if (existing?.submittedAt) {
        if (judgmentLocked(existing, now)) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'JUDGMENT_LOCKED',
            message: 'Your marks are locked. Ask the organisers if something needs fixing.',
          });
        }
      } else {
        slot = await this.findJudgeSlot(tx, entrant.leaderboardId, round.id, entrant.id, userId);
        if (!slot) {
          throw new ForbiddenException('Marks go in during the team’s slot. Call the team from your queue first.');
        }
      }

      for (const cell of cells) {
        await tx.leaderboardScore.upsert({
          where: {
            entrantId_metricId_judgeUserId_roundId: {
              entrantId: entrant.id,
              metricId: cell.metricId,
              judgeUserId: userId,
              roundId: round.id,
            },
          },
          create: {
            entrantId: entrant.id,
            metricId: cell.metricId,
            roundId: round.id,
            judgeUserId: userId,
            value: cell.value,
            comment: cell.comment,
            updatedBy: userId,
          },
          update: { value: cell.value, comment: cell.comment, updatedBy: userId },
        });
      }

      const firstSubmit = !!dto.submit && !existing?.submittedAt;
      const judgment = await tx.leaderboardJudgment.upsert({
        where: { entrantId_roundId_panelistUserId: key },
        create: {
          ...key,
          kind,
          overallReview: dto.overallReview,
          submittedAt: firstSubmit ? now : null,
          requestId: slot?.id ?? null,
        },
        update: {
          kind,
          ...(dto.overallReview !== undefined ? { overallReview: dto.overallReview } : {}),
          ...(firstSubmit ? { submittedAt: now } : {}),
          ...(slot && !existing?.requestId ? { requestId: slot.id } : {}),
        },
        select: { submittedAt: true, reopenedAt: true, requestId: true },
      });

      let panelUserIds: string[] = [];
      let completed = false;
      if (firstSubmit && slot) {
        let done = true;
        if (slot.panelId) {
          const members = await tx.hackathonPanelMember.findMany({
            where: { panelId: slot.panelId },
            select: { userId: true },
          });
          panelUserIds = members.map((m) => m.userId);
          const submitted = await tx.leaderboardJudgment.count({
            where: { requestId: slot.id, submittedAt: { not: null }, panelistUserId: { in: panelUserIds } },
          });
          done = submitted >= panelUserIds.length;
        }
        if (done) {
          const res = await tx.hackathonEvalRequest.updateMany({
            where: { id: slot.id, status: { in: [...OPEN_EVAL_STATUSES] } },
            data: { status: 'COMPLETED', closedAt: now, closedBy: userId },
          });
          completed = res.count > 0;
        }
      }
      return { judgment, panelUserIds, completed };
    });

    await this.recomputeAndBroadcast(board.id);
    this.gateway.hackathonChanged(board.eventId, {
      judgeUserIds: [userId, ...outcome.panelUserIds],
      entrantIds: [entrant.id],
    });
    return {
      ok: true,
      submittedAt: outcome.judgment.submittedAt,
      editableUntil: editableUntil(outcome.judgment),
      slotCompleted: outcome.completed,
    };
  }

  /**
   * The judge's running slot with this team in this round: their own request,
   * or one for a panel they sit on, that was called and started.
   */
  private async findJudgeSlot(
    tx: Prisma.TransactionClient,
    leaderboardId: string,
    roundId: string,
    entrantId: string,
    userId: string,
  ): Promise<{ id: string; panelId: string | null } | null> {
    const req = await tx.hackathonEvalRequest.findFirst({
      where: {
        leaderboardId,
        roundId,
        entrantId,
        status: { in: ['IN_PROGRESS', 'AWAITING_MARKS'] },
        OR: [{ judgeUserId: userId }, { panel: { members: { some: { userId } } } }],
      },
      select: { id: true, panelId: true },
    });
    if (req) return req;
    const called = await tx.hackathonEvalRequest.count({
      where: {
        leaderboardId,
        roundId,
        entrantId,
        status: 'CALLED',
        OR: [{ judgeUserId: userId }, { panel: { members: { some: { userId } } } }],
      },
    });
    if (called) throw new ForbiddenException('Start the slot once the team is with you, then give marks.');
    return null;
  }

  /**
   * The socket rooms this user may join for the event's hackathon: curators
   * the live queue room, judges their own queue room, team members their team's.
   */
  async hackathonRoomsFor(eventId: string, userId: string): Promise<string[]> {
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      select: { id: true, isHackathon: true, enabled: true },
    });
    if (!board?.isHackathon || !board.enabled) return [];
    const rooms: string[] = [];
    if (await this.isEventManager(userId, eventId)) rooms.push(hackathonRooms.manage(eventId));
    const judge = await this.prisma.leaderboardPanelist.count({ where: { leaderboardId: board.id, userId } });
    if (judge) rooms.push(hackathonRooms.judge(eventId, userId));
    const [myRegs, mySeats] = await Promise.all([
      this.prisma.eventRegistration.findMany({ where: { eventId, userId }, select: { id: true } }),
      this.prisma.groupSeat.findMany({
        where: { claimedByUserId: userId, status: 'CLAIMED', registration: { eventId } },
        select: { registrationId: true },
      }),
    ]);
    const regIds = [...new Set([...myRegs.map((r) => r.id), ...mySeats.map((s) => s.registrationId)])];
    if (regIds.length) {
      const teams = await this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId: board.id, registrationId: { in: regIds } },
        select: { id: true },
      });
      for (const t of teams) rooms.push(hackathonRooms.team(t.id));
    }
    return rooms;
  }

  /**
   * The panel kind this user acts as for a specific (round, entrant), honouring
   * scope: a null roundId covers all rounds, a null entrantId all entrants. JUDGE
   * wins over MENTOR when both somehow match (judges are the superset of powers).
   */
  private async resolvePanelistKind(
    leaderboardId: string,
    userId: string,
    roundId: string,
    entrantId: string,
  ): Promise<LeaderboardPanelistKind | null> {
    const rows = await this.prisma.leaderboardPanelist.findMany({
      where: {
        leaderboardId,
        userId,
        AND: [
          { OR: [{ roundId: null }, { roundId }] },
          { OR: [{ entrantId: null }, { entrantId }] },
        ],
      },
      select: { kind: true },
    });
    if (rows.length === 0) return null;
    return rows.some((r) => r.kind === LeaderboardPanelistKind.JUDGE)
      ? LeaderboardPanelistKind.JUDGE
      : LeaderboardPanelistKind.MENTOR;
  }

  private validateScoreCells(
    metrics: { id: string; label: string; minValue: Prisma.Decimal; maxValue: Prisma.Decimal }[],
    cells: { metricId: string; value: number }[],
  ) {
    const byId = new Map(metrics.map((m) => [m.id, m]));
    for (const cell of cells) {
      const metric = byId.get(cell.metricId);
      if (!metric) throw new BadRequestException(`Unknown metric ${cell.metricId}`);
      const min = Number(metric.minValue);
      const max = Number(metric.maxValue);
      if (cell.value < min || cell.value > max) {
        throw new BadRequestException(
          `Score for "${metric.label}" must be between ${min} and ${max}`,
        );
      }
    }
  }

  /**
   * Hackathon gate (plan §2 #10): a team can be judged only once its problem
   * statement is locked, never after its registration was cancelled, and not
   * at all while hackathon mode is off.
   */
  private assertHackathonTeamOpen(
    board: { isHackathon: boolean; enabled: boolean },
    entrant: { cancelledAt: Date | null; statementLockedAt: Date | null },
  ) {
    if (!board.isHackathon) return;
    if (!board.enabled) throw new NotFoundException('Hackathon mode is not on for this event');
    if (entrant.cancelledAt) throw new ForbiddenException("This team's registration was cancelled.");
    if (!entrant.statementLockedAt) {
      throw new ForbiddenException("This team hasn't locked in its problem statement yet.");
    }
  }

  private async loadEntrantWithBoard(entrantId: string) {
    const entrant = await this.prisma.leaderboardEntrant.findUnique({
      where: { id: entrantId },
      include: { leaderboard: { include: { metrics: true } } },
    });
    if (!entrant) throw new NotFoundException('Entrant not found');
    return entrant;
  }

  // ── Manual advancement / elimination ──────────────────────────────────────

  async setEntrantRoundStatus(
    userId: string,
    eventId: string,
    entrantId: string,
    dto: SetEntrantRoundStatusDto,
  ) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    const round = await this.getRoundOrThrow(board.id, dto.roundId);
    const entrant = await this.prisma.leaderboardEntrant.findFirst({
      where: { id: entrantId, leaderboardId: board.id },
      select: { id: true, name: true },
    });
    if (!entrant) throw new NotFoundException('Entrant not found on this board');
    const previous = await this.prisma.leaderboardEntrantRound.findUnique({
      where: { entrantId_roundId: { entrantId, roundId: round.id } },
      select: { status: true },
    });

    const decided =
      dto.status === LeaderboardEntrantRoundStatus.PENDING
        ? { decidedBy: null, decidedAt: null }
        : { decidedBy: userId, decidedAt: new Date() };

    const row = await this.prisma.leaderboardEntrantRound.upsert({
      where: { entrantId_roundId: { entrantId, roundId: round.id } },
      create: { entrantId, roundId: round.id, status: dto.status, ...decided },
      update: { status: dto.status, ...decided },
    });
    // An eliminated hackathon team's run has ended: it leaves any queue it's in.
    if (board.isHackathon && dto.status === LeaderboardEntrantRoundStatus.ELIMINATED) {
      const open = await this.prisma.hackathonEvalRequest.findMany({
        where: { entrantId, status: { in: [...OPEN_EVAL_STATUSES] } },
        select: { judgeUserId: true, panel: { select: { members: { select: { userId: true } } } } },
      });
      if (open.length) {
        await this.prisma.hackathonEvalRequest.updateMany({
          where: { entrantId, status: { in: [...OPEN_EVAL_STATUSES] } },
          data: { status: 'CANCELLED', closedAt: new Date(), closedReason: 'ELIMINATED', closedBy: userId },
        });
        this.gateway.hackathonChanged(eventId, {
          judgeUserIds: open.flatMap((r) => [r.judgeUserId, ...(r.panel?.members.map((m) => m.userId) ?? [])]).filter((id): id is string => !!id),
          entrantIds: [entrantId],
        });
      }
    }
    // The bracket participants see reads only this table — broadcast the change.
    await this.recomputeAndBroadcast(board.id);
    // Tell the team, but only on a real change to a decided state (re-saving the
    // same decision or resetting to PENDING stays quiet) and never on a DRAFT board.
    if (
      dto.status !== LeaderboardEntrantRoundStatus.PENDING &&
      previous?.status !== dto.status &&
      board.status !== 'DRAFT'
    ) {
      await this.notifyTeams(eventId, [entrant], {
        kind: dto.status === LeaderboardEntrantRoundStatus.ADVANCED ? 'ADVANCED' : 'ELIMINATED',
        label: round.name,
      });
    }
    return row;
  }

  // ── Awards ────────────────────────────────────────────────────────────────

  async listAwards(userId: string, eventId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    return this.prisma.leaderboardAward.findMany({
      where: { leaderboardId: board.id },
      orderBy: { order: 'asc' },
    });
  }

  async createAward(userId: string, eventId: string, dto: CreateAwardDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    const entrant = await this.prisma.leaderboardEntrant.findFirst({
      where: { id: dto.entrantId, leaderboardId: board.id },
      select: { id: true },
    });
    if (!entrant) throw new NotFoundException('Entrant not found on this board');
    return this.prisma.leaderboardAward.create({
      data: {
        leaderboardId: board.id,
        entrantId: dto.entrantId,
        title: dto.title,
        order: dto.order ?? 0,
      },
    });
  }

  async updateAward(userId: string, eventId: string, awardId: string, dto: UpdateAwardDto) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    await this.getAwardOrThrow(board.id, awardId);
    if (dto.entrantId) {
      const entrant = await this.prisma.leaderboardEntrant.findFirst({
        where: { id: dto.entrantId, leaderboardId: board.id },
        select: { id: true },
      });
      if (!entrant) throw new NotFoundException('Entrant not found on this board');
    }
    return this.prisma.leaderboardAward.update({ where: { id: awardId }, data: dto });
  }

  async deleteAward(userId: string, eventId: string, awardId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    await this.getAwardOrThrow(board.id, awardId);
    await this.prisma.leaderboardAward.delete({ where: { id: awardId } });
    await this.recomputeAndBroadcast(board.id);
    return { ok: true };
  }

  async setAwardPublished(
    userId: string,
    eventId: string,
    awardId: string,
    dto: SetAwardPublishedDto,
  ) {
    await this.assertCanManage(userId, eventId);
    const board = await this.getBoardByEventOrThrow(eventId);
    const before = await this.getAwardOrThrow(board.id, awardId);
    const award = await this.prisma.leaderboardAward.update({
      where: { id: awardId },
      data: {
        published: dto.published,
        declaredBy: dto.published ? userId : null,
        declaredAt: dto.published ? new Date() : null,
      },
    });
    await this.recomputeAndBroadcast(board.id);
    if (dto.published && !before.published && board.status !== 'DRAFT') {
      const winner = await this.prisma.leaderboardEntrant.findUnique({
        where: { id: award.entrantId },
        select: { id: true, name: true },
      });
      if (winner) await this.notifyTeams(eventId, [winner], { kind: 'AWARD', label: award.title });
    }
    return award;
  }

  // ── Participant notifications ───────────────────────────────────────────

  /**
   * Accounts that belong to each entrant. An entrant soft-links to a user and/or
   * a registration; a group registration's team is its lead plus every member
   * who claimed a seat.
   */
  async teamUserIds(entrantIds: string[]): Promise<Map<string, string[]>> {
    const entrants = await this.prisma.leaderboardEntrant.findMany({
      where: { id: { in: entrantIds } },
      select: { id: true, userId: true, registrationId: true },
    });
    const regIds = entrants.map((e) => e.registrationId).filter((id): id is string => !!id);
    const [regs, seats] = regIds.length
      ? await Promise.all([
          this.prisma.eventRegistration.findMany({
            where: { id: { in: regIds } },
            select: { id: true, userId: true },
          }),
          this.prisma.groupSeat.findMany({
            where: { registrationId: { in: regIds }, status: 'CLAIMED', claimedByUserId: { not: null } },
            select: { registrationId: true, claimedByUserId: true },
          }),
        ])
      : [[], []];
    const out = new Map<string, string[]>();
    for (const e of entrants) {
      const ids = new Set<string>();
      if (e.userId) ids.add(e.userId);
      if (e.registrationId) {
        const lead = regs.find((r) => r.id === e.registrationId)?.userId;
        if (lead) ids.add(lead);
        for (const s of seats) if (s.registrationId === e.registrationId && s.claimedByUserId) ids.add(s.claimedByUserId);
      }
      out.set(e.id, [...ids]);
    }
    return out;
  }

  /** One push per entrant (copy names the team). Best-effort: never fails the write. */
  private async notifyTeams(
    eventId: string,
    entrants: { id: string; name: string }[],
    update: Pick<CompetitionUpdateEvent, 'kind' | 'label'>,
  ) {
    try {
      const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
      if (!event) return;
      const teams = await this.teamUserIds(entrants.map((e) => e.id));
      for (const e of entrants) {
        const userIds = teams.get(e.id) ?? [];
        if (!userIds.length) continue;
        this.events.emit(NotificationEvents.CompetitionUpdate, {
          userIds,
          eventId,
          eventTitle: event.title,
          entrantName: e.name,
          ...update,
        } satisfies CompetitionUpdateEvent);
      }
    } catch {
      // Notifications are a side effect; the curator's change already landed.
    }
  }

  /** Feedback reveal: only teams that actually have a submitted written review. */
  private async notifyFeedbackRevealed(leaderboardId: string, eventId: string) {
    const reviewed = await this.prisma.leaderboardEntrant.findMany({
      where: {
        leaderboardId,
        judgments: { some: { submittedAt: { not: null }, overallReview: { not: null } } },
      },
      select: { id: true, name: true },
    });
    if (reviewed.length) await this.notifyTeams(eventId, reviewed, { kind: 'FEEDBACK' });
  }

  private async getAwardOrThrow(leaderboardId: string, awardId: string) {
    const award = await this.prisma.leaderboardAward.findFirst({
      where: { id: awardId, leaderboardId },
    });
    if (!award) throw new NotFoundException('Award not found on this board');
    return award;
  }

  // ── Ranking ─────────────────────────────────────────────────────────────

  /**
   * Recompute per-round scores/ranks from raw cells, mirror the FINAL round onto
   * each entrant's board-level total, and push a fresh snapshot to sockets.
   * FROZEN/DRAFT boards store new numbers but do not broadcast (pre-reveal).
   */
  async recomputeAndBroadcast(leaderboardId: string) {
    const board = await this.prisma.leaderboard.findUnique({
      where: { id: leaderboardId },
      include: {
        metrics: true,
        rounds: { orderBy: { order: 'asc' } },
        entrants: { include: { scores: true } },
      },
    });
    if (!board) return;
    if (board.rounds.length === 0) return; // nothing to rank yet

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    // roundId -> (entrantId -> {score, rank}) so we can lift the last round onto totals.
    const lastRound = board.rounds[board.rounds.length - 1];
    const lastRoundResult = new Map<string, { score: number; rank: number }>();

    for (const round of board.rounds) {
      // Applicable metrics: this round's own criteria, plus board-level (null).
      const metrics: MetricDef[] = board.metrics
        .filter((m) => m.roundId === null || m.roundId === round.id)
        .map((m) => ({ id: m.id, weight: Number(m.weight), isPrimary: m.isPrimary }));

      const inputs: EntrantInput[] = board.entrants.map((e) => {
        const cells = e.scores.filter((s) => s.roundId === round.id);
        return {
          entrantId: e.id,
          firstScoredAt: cells.length
            ? Math.min(...cells.map((s) => s.createdAt.getTime()))
            : e.createdAt.getTime(),
          cells: cells.map((s) => ({
            metricId: s.metricId,
            judgeUserId: s.judgeUserId,
            value: Number(s.value),
          })),
        };
      });

      const ranked = rankEntrants(inputs, metrics, {
        mode: board.mode as RankMode,
        tieBreak: board.tieBreak,
        tieBreakMetricId: board.tieBreakMetricId,
      });

      for (const r of ranked) {
        updates.push(
          this.prisma.leaderboardEntrantRound.upsert({
            where: { entrantId_roundId: { entrantId: r.entrantId, roundId: round.id } },
            create: {
              entrantId: r.entrantId,
              roundId: round.id,
              roundScore: r.totalScore,
              rank: r.rank,
            },
            update: { roundScore: r.totalScore, rank: r.rank },
          }),
        );
        if (round.id === lastRound.id) {
          lastRoundResult.set(r.entrantId, { score: r.totalScore, rank: r.rank });
        }
      }
    }

    // Final ranking = the last round's ranking, mirrored to entrant totals.
    for (const e of board.entrants) {
      const final = lastRoundResult.get(e.id);
      updates.push(
        this.prisma.leaderboardEntrant.update({
          where: { id: e.id },
          data: { totalScore: final?.score ?? 0, rank: final?.rank ?? null },
        }),
      );
    }

    await this.prisma.$transaction(updates);

    if (board.status !== 'FROZEN' && board.status !== 'DRAFT') {
      this.gateway.broadcast(board.eventId, await this.getPublicSnapshot(board.eventId));
    }
  }

  // ── Read models ─────────────────────────────────────────────────────────

  /**
   * Curator/manager view: the full board including rounds, metrics, entrants,
   * per-round standings, panelists, judgment completion, and awards. Restricted
   * to managers — panelists never call this (it would expose every cell).
   */
  async getManageView(userId: string, eventId: string) {
    await this.assertCanManage(userId, eventId);
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      include: {
        rounds: { orderBy: { order: 'asc' } },
        metrics: { orderBy: { displayOrder: 'asc' } },
        entrants: {
          orderBy: [{ rank: 'asc' }, { name: 'asc' }],
          // The curator sees everything (privacy table row 4): raw judge cells,
          // per-round standings, and every judgment (review text + `submittedAt`,
          // which drives the review-completion matrix on the space console).
          include: { scores: true, entrantRounds: true, judgments: true },
        },
        panelists: true,
        awards: { orderBy: { order: 'asc' } },
      },
    });
    if (!board) return null;

    // Panelist `userId` is a soft ref (no FK) — hydrate display fields so the
    // panels tab and completion matrix can label rows without a second call.
    const panelistUserIds = [...new Set(board.panelists.map((p) => p.userId))];
    const users = panelistUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: panelistUserIds } },
          select: { id: true, fullName: true, username: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      ...board,
      panelists: board.panelists.map((p) => ({ ...p, user: byId.get(p.userId) ?? null })),
    };
  }

  /** Public read model: ranked entrants + totals only, no raw judge cells. */
  async getPublicSnapshot(eventId: string) {
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      include: {
        metrics: { orderBy: { displayOrder: 'asc' }, select: { id: true, key: true, label: true } },
        entrants: {
          orderBy: [{ rank: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, rank: true, totalScore: true, meta: true },
        },
      },
    });
    if (!board) return null;
    return {
      id: board.id,
      eventId: board.eventId,
      title: board.title,
      description: board.description,
      mode: board.mode,
      status: board.status,
      visibility: board.visibility,
      metrics: board.metrics,
      entrants: board.entrants.map((e) => ({
        id: e.id,
        name: e.name,
        rank: e.rank,
        totalScore: Number(e.totalScore),
        meta: e.meta,
      })),
    };
  }

  /**
   * Whether a (possibly anonymous) viewer may see this board — used by both the
   * public HTTP endpoint and the socket subscribe handler.
   */
  async canView(eventId: string, userId: string | null): Promise<boolean> {
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      select: { visibility: true, status: true, enabled: true },
    });
    if (!board || !board.enabled) return false;

    const privileged = userId
      ? await this.isEventPanelistOrManager(userId, eventId)
      : false;
    if (board.status === 'DRAFT') return privileged;
    if (board.visibility === 'PUBLIC') return true;
    // PARTICIPANTS_ONLY: managers/panelists, or a registered attendee.
    if (privileged) return true;
    if (!userId) return false;
    const reg = await this.prisma.eventRegistration.count({ where: { eventId, userId } });
    return reg > 0;
  }

  async getPublicIfAllowed(eventId: string, userId: string | null) {
    if (!(await this.canView(eventId, userId))) {
      throw new ForbiddenException('This leaderboard is not available');
    }
    return this.getPublicSnapshot(eventId);
  }

  // ── Panelist reads (round-close read-lock) ────────────────────────────────

  /**
   * Cross-event discovery for the mobile "Judging" list: every event where the
   * signed-in user holds a {@link LeaderboardPanelist} assignment, with the card
   * fields the list needs plus how they act (JUDGE vs MENTOR) and how many rounds
   * are currently open for scoring. This is the panelist analogue of
   * `getMyCheckinEvents` — the per-event detail comes from {@link getMyAssignments}.
   *
   * A user judging as both roles on one board surfaces as JUDGE (the superset of
   * powers), matching {@link resolvePanelistKind}. Disabled boards and hidden
   * events are excluded; unlike check-in we do NOT filter on the event end time,
   * because hackathon judging routinely runs during and just after the event.
   */
  async getMyJudgingEvents(userId: string) {
    const panelRows = await this.prisma.leaderboardPanelist.findMany({
      where: { userId },
      select: { leaderboardId: true, kind: true },
    });
    if (panelRows.length === 0) return { events: [] };

    // Collapse to one kind per board — JUDGE wins over MENTOR.
    const kindByBoard = new Map<string, LeaderboardPanelistKind>();
    for (const p of panelRows) {
      if (kindByBoard.get(p.leaderboardId) !== LeaderboardPanelistKind.JUDGE) {
        kindByBoard.set(p.leaderboardId, p.kind);
      }
    }

    const boards = await this.prisma.leaderboard.findMany({
      where: {
        id: { in: [...kindByBoard.keys()] },
        enabled: true,
        event: { ...NOT_DELETED },
      },
      select: {
        id: true,
        title: true,
        isHackathon: true,
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            startDateTime: true,
            endDateTime: true,
            coverImageUrl: true,
            venueName: true,
            city: true,
            space: { select: { id: true, name: true } },
          },
        },
        rounds: { select: { status: true } },
      },
    });

    const events = boards
      .map((b) => ({
        boardId: b.id,
        boardTitle: b.title,
        isHackathon: b.isHackathon,
        kind: kindByBoard.get(b.id)!,
        totalRounds: b.rounds.length,
        activeRounds: b.rounds.filter((r) => r.status === LeaderboardRoundStatus.ACTIVE).length,
        eventId: b.event.id,
        title: b.event.title,
        slug: b.event.slug,
        startDateTime: b.event.startDateTime,
        endDateTime: b.event.endDateTime,
        coverImageUrl: b.event.coverImageUrl,
        venueName: b.event.venueName,
        city: b.event.city,
        space: b.event.space,
      }))
      .sort((a, b) => {
        // Boards with an open round first; then most recent event.
        if ((b.activeRounds > 0 ? 1 : 0) !== (a.activeRounds > 0 ? 1 : 0)) {
          return (b.activeRounds > 0 ? 1 : 0) - (a.activeRounds > 0 ? 1 : 0);
        }
        return b.startDateTime.getTime() - a.startDateTime.getTime();
      });

    return { events };
  }

  /**
   * The mobile "Judging" payload: for a board this user is a panelist on, the
   * rounds + entrants in their scope with their own reviewed/not-reviewed state.
   * Returns null when the user holds no panel assignment on the event.
   */
  async getMyAssignments(userId: string, eventId: string) {
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      include: {
        rounds: { orderBy: { order: 'asc' } },
        entrants: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, meta: true, cancelledAt: true, statementLockedAt: true },
        },
        metrics: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!board) return null;
    // A switched-off hackathon is hidden from judges too; and until a team
    // locks in its problem statement (or if it's cancelled) there's nothing to judge.
    if (board.isHackathon && !board.enabled) return null;
    const judgeable = board.isHackathon
      ? board.entrants.filter((e) => !e.cancelledAt && e.statementLockedAt)
      : board.entrants;

    const panelRows = await this.prisma.leaderboardPanelist.findMany({
      where: { leaderboardId: board.id, userId },
    });
    if (panelRows.length === 0) return null;

    const myJudgments = await this.prisma.leaderboardJudgment.findMany({
      where: { panelistUserId: userId, entrant: { leaderboardId: board.id } },
      select: { entrantId: true, roundId: true, submittedAt: true },
    });
    const reviewed = new Set(
      myJudgments.filter((j) => j.submittedAt).map((j) => `${j.roundId}:${j.entrantId}`),
    );

    // A panel row with a null round/entrant covers all of them.
    const covers = (roundId: string, entrantId: string) =>
      panelRows.some(
        (p) =>
          (p.roundId === null || p.roundId === roundId) &&
          (p.entrantId === null || p.entrantId === entrantId),
      );
    const kind = panelRows.some((p) => p.kind === LeaderboardPanelistKind.JUDGE)
      ? LeaderboardPanelistKind.JUDGE
      : LeaderboardPanelistKind.MENTOR;

    return {
      boardId: board.id,
      eventId,
      title: board.title,
      isHackathon: board.isHackathon,
      kind,
      metrics: board.metrics.map((m) => ({
        id: m.id,
        key: m.key,
        label: m.label,
        roundId: m.roundId,
        minValue: Number(m.minValue),
        maxValue: Number(m.maxValue),
        weight: Number(m.weight),
      })),
      rounds: board.rounds.map((r) => ({
        id: r.id,
        name: r.name,
        order: r.order,
        status: r.status,
        // CLOSED rounds are read-locked: panelists see the round but no entrants.
        entrants:
          r.status === LeaderboardRoundStatus.CLOSED
            ? []
            : judgeable
                .filter((e) => covers(r.id, e.id))
                .map((e) => ({
                  id: e.id,
                  name: e.name,
                  meta: e.meta,
                  reviewed: reviewed.has(`${r.id}:${e.id}`),
                })),
      })),
    };
  }

  /**
   * A panelist's OWN cells + review for one entrant/round. Read-locked once the
   * round is CLOSED (server-side, not just hidden), and never returns another
   * panelist's data.
   */
  async getMyJudgment(userId: string, entrantId: string, roundId: string) {
    const entrant = await this.loadEntrantWithBoard(entrantId);
    const board = entrant.leaderboard;
    const round = await this.getRoundOrThrow(board.id, roundId);

    const kind = await this.resolvePanelistKind(board.id, userId, round.id, entrantId);
    if (!kind) {
      throw new ForbiddenException('You are not on the panel for this entrant/round.');
    }
    // The round-close read-lock — enforced here, not just in the UI.
    if (round.status === LeaderboardRoundStatus.CLOSED) {
      throw new ForbiddenException('This round is closed.');
    }

    const [scores, judgment] = await Promise.all([
      kind === LeaderboardPanelistKind.JUDGE
        ? this.prisma.leaderboardScore.findMany({
            where: { entrantId, roundId: round.id, judgeUserId: userId },
            select: { metricId: true, value: true, comment: true },
          })
        : Promise.resolve([]),
      this.prisma.leaderboardJudgment.findFirst({
        where: { entrantId, roundId: round.id, panelistUserId: userId },
        select: { overallReview: true, submittedAt: true, reopenedAt: true },
      }),
    ]);

    const now = new Date();
    return {
      entrantId,
      roundId: round.id,
      kind,
      scores: scores.map((s) => ({
        metricId: s.metricId,
        value: Number(s.value),
        comment: s.comment,
      })),
      overallReview: judgment?.overallReview ?? null,
      submittedAt: judgment?.submittedAt ?? null,
      // Hackathon boards lock submitted marks 5 minutes after submit / reopen.
      editableUntil: board.isHackathon && judgment ? editableUntil(judgment) : null,
      locked: board.isHackathon && !!judgment && judgmentLocked(judgment, now),
      hackathon: board.isHackathon ? await this.judgeTeamContext(board.id, round.id, entrantId, userId, now) : null,
    };
  }

  /**
   * What a judge sees about a team while marking it (plan §2 #29): Team ID,
   * name, member names (never contacts), room, problem statement and theme,
   * plus their running slot with it, if any.
   */
  private async judgeTeamContext(leaderboardId: string, roundId: string, entrantId: string, userId: string, now: Date) {
    const [team, slot, round] = await Promise.all([
      this.prisma.leaderboardEntrant.findUnique({
        where: { id: entrantId },
        select: {
          teamCode: true,
          name: true,
          registrationId: true,
          room: { select: { name: true, location: true } },
          ...TEAM_STATEMENT_SELECT,
        },
      }),
      this.prisma.hackathonEvalRequest.findFirst({
        where: {
          leaderboardId,
          roundId,
          entrantId,
          status: { in: [...SLOT_EVAL_STATUSES] },
          OR: [{ judgeUserId: userId }, { panel: { members: { some: { userId } } } }],
        },
        select: { id: true, status: true, calledAt: true, startedAt: true, slotEndsAt: true, panel: { select: { name: true } } },
      }),
      this.prisma.leaderboardRound.findUnique({
        where: { id: roundId },
        select: { name: true, slotMinutes: true, judgingMode: true },
      }),
    ]);
    if (!team) return null;
    const memberNames = team.registrationId ? await this.teamMemberNames(team.registrationId) : [];
    return {
      teamCode: team.teamCode,
      teamName: team.name,
      members: memberNames,
      room: team.room,
      statement: statementView(team),
      round,
      slot: slot
        ? {
            requestId: slot.id,
            status: effectiveStatus(slot, now),
            calledAt: slot.calledAt,
            startedAt: slot.startedAt,
            slotEndsAt: slot.slotEndsAt,
            panelName: slot.panel?.name ?? null,
          }
        : null,
    };
  }

  /** Names on a group registration: the lead and each held seat. Names only, no contacts. */
  async teamMemberNames(registrationId: string): Promise<string[]> {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { user: { select: { fullName: true, username: true } } },
    });
    const seats = await this.prisma.groupSeat.findMany({
      where: { registrationId, status: { not: 'RELEASED' } },
      orderBy: { seatIndex: 'asc' },
      select: { seatIndex: true, memberDetails: true, claimedBy: { select: { fullName: true, username: true } } },
    });
    const leadName = reg?.user.fullName || reg?.user.username || null;
    if (!seats.length) return leadName ? [leadName] : [];
    return seats
      .map((s) => {
        const details =
          s.memberDetails && typeof s.memberDetails === 'object' && !Array.isArray(s.memberDetails)
            ? (s.memberDetails as Record<string, unknown>)
            : {};
        const typed = typeof details.name === 'string' ? details.name.trim() : '';
        return s.claimedBy?.fullName || s.claimedBy?.username || typed || (s.seatIndex === 1 ? leadName : null);
      })
      .filter((n): n is string => !!n);
  }

  // ── Participant view (never exposes marks) ────────────────────────────────

  /**
   * What a participant sees for an event with a board: their own team's per-round
   * status, the public bracket (names + status only, NO scores), declared
   * winners, and — only when the curator has flipped `revealReviews` — the
   * written feedback about their OWN team. Marks are never included.
   */
  async getParticipantView(eventId: string, userId: string) {
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      include: {
        rounds: { orderBy: { order: 'asc' }, select: { id: true, name: true, order: true, status: true } },
        entrants: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, userId: true, registrationId: true },
        },
      },
    });
    if (!board || !board.enabled || board.status === 'DRAFT') return null;

    // Resolve which entrant(s) belong to this participant (soft links): their own
    // registration, or a group registration where they claimed a seat.
    const [myRegs, mySeats] = await Promise.all([
      this.prisma.eventRegistration.findMany({ where: { eventId, userId }, select: { id: true } }),
      this.prisma.groupSeat.findMany({
        where: { claimedByUserId: userId, status: 'CLAIMED', registration: { eventId } },
        select: { registrationId: true },
      }),
    ]);
    const myRegIds = new Set([...myRegs.map((r) => r.id), ...mySeats.map((s) => s.registrationId)]);
    const myEntrantIds = new Set(
      board.entrants
        .filter((e) => e.userId === userId || (e.registrationId && myRegIds.has(e.registrationId)))
        .map((e) => e.id),
    );

    // Standings drive the bracket — read ONLY from entrant_rounds (never scores).
    const standings = await this.prisma.leaderboardEntrantRound.findMany({
      where: { round: { leaderboardId: board.id } },
      select: { entrantId: true, roundId: true, status: true },
    });
    const statusByKey = new Map(standings.map((s) => [`${s.roundId}:${s.entrantId}`, s.status]));

    // Published awards only.
    const awards = await this.prisma.leaderboardAward.findMany({
      where: { leaderboardId: board.id, published: true },
      orderBy: { order: 'asc' },
      select: { id: true, title: true, entrantId: true },
    });

    // Own feedback, only when revealed — overall reviews, NO marks/comments-on-cells.
    let myFeedback: Array<{ roundId: string; entrantId: string; overallReview: string | null }> = [];
    if (board.revealReviews && myEntrantIds.size > 0) {
      const reviews = await this.prisma.leaderboardJudgment.findMany({
        where: {
          entrantId: { in: [...myEntrantIds] },
          submittedAt: { not: null },
          overallReview: { not: null },
        },
        select: { roundId: true, entrantId: true, overallReview: true },
      });
      myFeedback = reviews;
    }

    return {
      eventId,
      title: board.title,
      mode: board.mode,
      revealReviews: board.revealReviews,
      myEntrantIds: [...myEntrantIds],
      rounds: board.rounds.map((r) => ({
        id: r.id,
        name: r.name,
        order: r.order,
        status: r.status,
        entrants: board.entrants.map((e) => ({
          id: e.id,
          name: e.name,
          isMine: myEntrantIds.has(e.id),
          status: statusByKey.get(`${r.id}:${e.id}`) ?? LeaderboardEntrantRoundStatus.PENDING,
        })),
      })),
      awards: awards.map((a) => ({
        id: a.id,
        title: a.title,
        entrantId: a.entrantId,
        entrantName: board.entrants.find((e) => e.id === a.entrantId)?.name ?? null,
        isMine: myEntrantIds.has(a.entrantId),
      })),
      feedback: myFeedback,
    };
  }

  // ── Judges (legacy event-role assignment, kept for the current hack app) ──

  async assignJudge(userId: string, eventId: string, dto: AssignJudgeDto) {
    await this.assertCanManage(userId, eventId);
    await this.grantPanelistRole(dto.userId, eventId, LeaderboardPanelistKind.JUDGE, userId);
    const role = await this.prisma.role.findUnique({ where: { code: RoleCode.JUDGE } });
    return this.prisma.userRole.findFirst({
      where: { userId: dto.userId, roleId: role!.id, eventId, spaceId: null },
    });
  }

  async removeJudge(userId: string, eventId: string, judgeUserId: string) {
    await this.assertCanManage(userId, eventId);
    const role = await this.prisma.role.findUnique({ where: { code: RoleCode.JUDGE } });
    if (!role) return { ok: true };
    await this.prisma.userRole.deleteMany({
      where: { userId: judgeUserId, roleId: role.id, eventId },
    });
    return { ok: true };
  }

  async listJudges(userId: string, eventId: string) {
    await this.assertCanManage(userId, eventId);
    return this.prisma.userRole.findMany({
      where: { eventId, role: { code: RoleCode.JUDGE } },
      include: { user: { select: { id: true, fullName: true, username: true } } },
    });
  }

  // ── Account resolution ────────────────────────────────────────────────────

  /**
   * Find an account by its email identity, or mint a claimable placeholder one —
   * the same pattern manual attendee add uses. Accounts are keyed by mobile, so a
   * fresh invite has no phone number; we create a User with a synthetic
   * placeholder mobile plus an EMAIL identity carrying the real address. When
   * that person later signs in with the same email, auth resolves + links them.
   */
  async findOrCreateUserByEmail(email: string, name: string): Promise<string> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) throw new BadRequestException('A valid email is required.');

    const existing = await this.prisma.userIdentity.findFirst({
      where: { email: normalized },
      select: { userId: true, user: { select: { fullName: true } } },
    });
    if (existing) {
      if (!existing.user?.fullName && name) {
        await this.prisma.user
          .update({ where: { id: existing.userId }, data: { fullName: name } })
          .catch(() => undefined);
      }
      return existing.userId;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const placeholderMobile = `+0${crypto.randomInt(100000000, 999999999)}`;
      try {
        const user = await this.prisma.user.create({
          data: {
            mobileNumber: placeholderMobile,
            mobileVerified: false,
            fullName: name || null,
            identities: {
              create: {
                provider: Provider.EMAIL,
                providerUserId: normalized,
                email: normalized,
                emailVerified: false,
                isPrimary: true,
              },
            },
          },
          select: { id: true },
        });
        return user.id;
      } catch (err) {
        const raced = await this.prisma.userIdentity.findFirst({
          where: { email: normalized },
          select: { userId: true },
        });
        if (raced) return raced.userId;
        if (attempt === 4) throw err;
      }
    }
    throw new BadRequestException(`Could not resolve an account for ${email}`);
  }
}
