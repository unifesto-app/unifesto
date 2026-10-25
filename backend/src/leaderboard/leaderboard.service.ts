import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  GroupSeatStatus,
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
import { Action, AuthorizationService } from '../auth/authorization';
import { PlanConfigService } from '../subscription/plan-config.service';
import { LeaderboardGateway } from './leaderboard.gateway';
import {
  CreateRoundDto,
  SetEntrantRoundStatusDto,
  SubmitJudgmentDto,
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
  cumulativeTotal,
  editableUntil,
  effectiveStatus,
  finalRoundId,
  judgmentLocked,
  readLinks,
  submittedKey,
  takesPart,
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

  /**
   * Declaring and publishing hackathon winners (plan §2 #32): Curator and
   * Space Admin, not Co-Curator. A separate capability so it's editable in IAM.
   */
  async assertCanDeclareWinners(userId: string, eventId: string): Promise<void> {
    await this.authz.assertCan({ id: userId }, Action.EVENT_DECLARE_HACKATHON_WINNERS, { eventId });
  }

  canDeclareWinners(userId: string, eventId: string): Promise<boolean> {
    return this.authz.can({ id: userId }, Action.EVENT_DECLARE_HACKATHON_WINNERS, { eventId });
  }

  /** Non-throwing assertCanManage. */
  canManage(userId: string, eventId: string): Promise<boolean> {
    return this.isEventManager(userId, eventId);
  }

  private async isEventManager(userId: string, eventId: string): Promise<boolean> {
    return this.authz.can({ id: userId }, Action.EVENT_MANAGE_LEADERBOARD, {
      eventId,
    });
  }

  /**
   * May this user act as a panelist (or manager) for viewing purposes? Lets
   * judges/mentors and operators read a participants-only bracket.
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
   * Whether the event's space plan includes the competitive dashboard. A
   * missing subscription is left alone rather than locking a not-yet-billed
   * space out.
   */
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

  private async getBoardByEventOrThrow(eventId: string) {
    const board = await this.prisma.leaderboard.findUnique({ where: { eventId } });
    if (!board) throw new NotFoundException('This event has no leaderboard');
    return board;
  }

  // ── Rounds ──────────────────────────────────────────────────────────────

  private async getRoundOrThrow(leaderboardId: string, roundId: string) {
    const round = await this.prisma.leaderboardRound.findFirst({
      where: { id: roundId, leaderboardId },
    });
    if (!round) throw new NotFoundException('Round not found on this board');
    return round;
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

    if (board.isHackathon) {
      // Conflict of interest: nobody marks or reviews their own team.
      if (entrant.registrationId && (await this.onTeam(entrant.registrationId, userId))) {
        throw new ForbiddenException('You’re on this team, so you can’t mark it.');
      }
      // The round decides the role: judges mark evaluation rounds, mentors give
      // feedback in mentoring rounds.
      const needed = round.kind === 'MENTORING' ? LeaderboardPanelistKind.MENTOR : LeaderboardPanelistKind.JUDGE;
      const covering = await this.prisma.leaderboardPanelist.count({
        where: {
          leaderboardId: board.id,
          userId,
          kind: needed,
          AND: [{ OR: [{ roundId: null }, { roundId: round.id }] }, { OR: [{ entrantId: null }, { entrantId }] }],
        },
      });
      // A panel seat covers that panel's slots, even for a judge scoped to
      // another round; otherwise the panel could never finish the slot.
      const seated =
        !covering &&
        needed === LeaderboardPanelistKind.JUDGE &&
        (await this.prisma.hackathonEvalRequest.count({
          where: { leaderboardId: board.id, roundId: round.id, entrantId, panel: { members: { some: { userId } } } },
        }));
      if (!covering && !seated) {
        throw new ForbiddenException(
          needed === LeaderboardPanelistKind.MENTOR ? 'Only mentors give feedback in a mentoring round.' : 'Only judges give marks in this round.',
        );
      }
      return this.submitHackathonJudgment(userId, { id: entrantId, leaderboardId: board.id }, board, round, needed, dto);
    }
    const kind = await this.resolvePanelistKind(board.id, userId, round.id, entrantId);
    if (!kind) {
      throw new ForbiddenException('You are not on the panel for this entrant/round.');
    }
    const hasScores = (dto.scores?.length ?? 0) > 0;
    if (hasScores && kind === LeaderboardPanelistKind.MENTOR) {
      throw new ForbiddenException('Mentors submit reviews only, not scores.');
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
    const mentor = kind === LeaderboardPanelistKind.MENTOR;
    // An empty review or comment clears what the judge wrote before.
    const review = dto.overallReview === undefined ? undefined : dto.overallReview.trim() || null;
    const comment = (c?: string) => (c === undefined ? undefined : c.trim() || null);
    if (mentor && (dto.scores?.length ?? 0) > 0) {
      throw new ForbiddenException('Mentors give written feedback, not marks.');
    }
    const metrics = mentor ? [] : board.metrics.filter((m) => m.roundId === null || m.roundId === round.id);
    const cells = dto.scores ?? [];
    const inRound = new Set(metrics.map((m) => m.id));
    for (const c of cells) {
      if (!inRound.has(c.metricId)) throw new BadRequestException('That criterion isn’t part of this round.');
    }
    this.validateScoreCells(metrics, cells);
    if (dto.submit && mentor) {
      if (dto.overallReview !== undefined && !dto.overallReview.trim()) {
        throw new BadRequestException('Write your feedback before submitting.');
      }
    } else if (dto.submit) {
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
        select: { submittedAt: true, reopenedAt: true, requestId: true, overallReview: true },
      });
      // A mentor's session is their feedback: there must be some to submit.
      if (mentor && dto.submit && !(review === undefined ? existing?.overallReview : review)?.trim()) {
        throw new BadRequestException('Write your feedback before submitting.');
      }
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
            comment: comment(cell.comment),
            updatedBy: userId,
          },
          update: { value: cell.value, comment: comment(cell.comment), updatedBy: userId },
        });
      }

      const firstSubmit = !!dto.submit && !existing?.submittedAt;
      const judgment = await tx.leaderboardJudgment.upsert({
        where: { entrantId_roundId_panelistUserId: key },
        create: {
          ...key,
          kind,
          overallReview: review,
          submittedAt: firstSubmit ? now : null,
          requestId: slot?.id ?? null,
        },
        update: {
          kind,
          ...(review !== undefined ? { overallReview: review } : {}),
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
          // Serialise the panel's submits on the slot row: without it two last
          // judges submitting together each miss the other's uncommitted mark
          // and neither completes the slot.
          await tx.$queryRaw`SELECT id FROM hackathon_eval_requests WHERE id = ${slot.id}::uuid FOR UPDATE`;
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

  /** The user booked this team's registration or holds a claimed seat in it. */
  private async onTeam(registrationId: string, userId: string) {
    const n = await this.prisma.eventRegistration.count({
      where: {
        id: registrationId,
        OR: [{ userId }, { groupSeats: { some: { claimedByUserId: userId, status: GroupSeatStatus.CLAIMED } } }],
      },
    });
    return n > 0;
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
  async notifyTeams(
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
  async notifyFeedbackRevealed(leaderboardId: string, eventId: string) {
    const reviewed = await this.prisma.leaderboardEntrant.findMany({
      where: {
        leaderboardId,
        judgments: { some: { submittedAt: { not: null }, overallReview: { not: null } } },
      },
      select: { id: true, name: true },
    });
    if (reviewed.length) await this.notifyTeams(eventId, reviewed, { kind: 'FEEDBACK' });
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
        entrants: {
          include: {
            scores: true,
            judgments: { where: { submittedAt: { not: null } }, select: { roundId: true, panelistUserId: true } },
            entrantRounds: { select: { roundId: true, roundScore: true, rank: true } },
          },
        },
      },
    });
    if (!board) return;
    if (board.rounds.length === 0) return; // nothing to rank yet

    // Only write rows whose score or rank moved: a recompute runs on every
    // submitted mark, and usually changes a handful of rows, not rounds x teams.
    // Compared at the column's 4 decimal places.
    const same = (stored: Prisma.Decimal | null | undefined, next: number) =>
      stored != null && Math.round(Number(stored) * 1e4) === Math.round(next * 1e4);
    const storedRound = new Map(
      board.entrants.flatMap((e) => e.entrantRounds.map((r) => [`${e.id}:${r.roundId}`, r] as const)),
    );

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    // roundId -> (entrantId -> {score, rank}) so we can lift the last round onto totals.
    // Hackathons rank PER_ROUND on the latest round that was opened (plan §9).
    const lastRoundId = board.isHackathon ? finalRoundId(board.rounds) : board.rounds[board.rounds.length - 1].id;
    const lastRoundResult = new Map<string, { score: number; rank: number }>();
    // Hackathon: only marks from submitted evaluations count; drafts are ignored.
    const submitted = new Set(
      board.entrants.flatMap((e) => e.judgments.map((j) => submittedKey(j.roundId, e.id, j.panelistUserId))),
    );
    const counts = (s: { roundId: string; entrantId: string; judgeUserId: string | null }) =>
      !board.isHackathon || (!!s.judgeUserId && submitted.has(submittedKey(s.roundId, s.entrantId, s.judgeUserId)));
    // entrantId -> roundId -> round score, for CUMULATIVE totals.
    const roundScores = new Map<string, Map<string, number>>();

    for (const round of board.rounds) {
      // Applicable metrics: this round's own criteria, plus board-level (null).
      const metrics: MetricDef[] = board.metrics
        .filter((m) => m.roundId === null || m.roundId === round.id)
        .map((m) => ({ id: m.id, weight: Number(m.weight), isPrimary: m.isPrimary }));

      const inputs: EntrantInput[] = board.entrants.map((e) => {
        const cells = e.scores.filter((s) => s.roundId === round.id && counts(s));
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
        const stored = storedRound.get(`${r.entrantId}:${round.id}`);
        const unchanged = stored && same(stored.roundScore, r.totalScore) && stored.rank === r.rank;
        if (!unchanged) updates.push(
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
        if (round.id === lastRoundId) {
          lastRoundResult.set(r.entrantId, { score: r.totalScore, rank: r.rank });
        }
        const byRound = roundScores.get(r.entrantId) ?? new Map<string, number>();
        byRound.set(round.id, r.totalScore);
        roundScores.set(r.entrantId, byRound);
      }
    }

    if (board.isHackathon && board.scoringMode === 'CUMULATIVE') {
      // CUMULATIVE: total = plain sum of the counted rounds' scores (plan §9).
      const counted = new Set(board.rounds.filter((r) => r.countsTowardTotal).map((r) => r.id));
      const totals = board.entrants
        .map((e) => ({ id: e.id, total: cumulativeTotal(roundScores.get(e.id) ?? new Map(), counted) }))
        .sort((a, b) => b.total - a.total);
      totals.forEach((t, i) => {
        const prev = i > 0 ? totals[i - 1] : null;
        const rank = prev && prev.total === t.total ? (lastRoundResult.get(prev.id)?.rank ?? i + 1) : i + 1;
        lastRoundResult.set(t.id, { score: t.total, rank });
      });
    }

    // Final ranking = the last round's ranking (or the cumulative one), mirrored to entrant totals.
    for (const e of board.entrants) {
      const final = lastRoundResult.get(e.id);
      const score = final?.score ?? 0;
      const rank = final?.rank ?? null;
      if (same(e.totalScore, score) && e.rank === rank) continue;
      updates.push(
        this.prisma.leaderboardEntrant.update({
          where: { id: e.id },
          data: { totalScore: score, rank },
        }),
      );
    }

    if (updates.length) await this.prisma.$transaction(updates);
  }

  // ── Read models ─────────────────────────────────────────────────────────

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
      kind: board.isHackathon ? (round.kind === 'MENTORING' ? LeaderboardPanelistKind.MENTOR : LeaderboardPanelistKind.JUDGE) : kind,
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
    const [team, slot, round, submission] = await Promise.all([
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
        select: { name: true, slotMinutes: true, judgingMode: true, kind: true },
      }),
      this.prisma.hackathonSubmission.findUnique({
        where: { entrantId_roundId: { entrantId, roundId } },
        select: { links: true, notes: true },
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
      // The team's project links for this round.
      links: readLinks(submission?.links),
      linksNotes: submission?.notes ?? null,
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
        rounds: { orderBy: { order: 'asc' }, select: { id: true, name: true, order: true, status: true, eliminationEnabled: true } },
        entrants: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            userId: true,
            registrationId: true,
            teamCode: true,
            cancelledAt: true,
            statementLockedAt: true,
          },
        },
      },
    });
    if (!board || !board.enabled || board.status === 'DRAFT') return null;
    // Hackathon bracket: only teams that are in (not cancelled, statement locked).
    if (board.isHackathon) {
      board.entrants = board.entrants.filter((e) => !e.cancelledAt && e.statementLockedAt);
    }

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

    // E8: a participants-only bracket is for attendees, panelists and operators.
    if (
      board.visibility !== 'PUBLIC' &&
      myRegIds.size === 0 &&
      myEntrantIds.size === 0 &&
      !(await this.isEventPanelistOrManager(userId, eventId))
    ) {
      return null;
    }

    // Standings drive the bracket — read ONLY from entrant_rounds (never scores).
    const standings = await this.prisma.leaderboardEntrantRound.findMany({
      where: { round: { leaderboardId: board.id } },
      select: { entrantId: true, roundId: true, status: true },
    });
    const statusByKey = new Map(standings.map((s) => [`${s.roundId}:${s.entrantId}`, s.status]));
    const standing = (roundId: string, entrantId: string) =>
      statusByKey.get(`${roundId}:${entrantId}`) ?? LeaderboardEntrantRoundStatus.PENDING;
    // A hackathon round lists only the teams in it, and a closed round that
    // doesn't eliminate carries everyone in it on (nobody decides it, so its
    // standings would read "pending" forever).
    const roundEntrants = (r: (typeof board.rounds)[number]) =>
      board.entrants
        .filter((e) => !board.isHackathon || takesPart(board.rounds, (id) => standing(id, e.id), r.id).in)
        .map((e) => {
          const own = standing(r.id, e.id);
          const carriedOn =
            board.isHackathon && !r.eliminationEnabled && r.status === LeaderboardRoundStatus.CLOSED && own === LeaderboardEntrantRoundStatus.PENDING;
          return { e, status: carriedOn ? LeaderboardEntrantRoundStatus.ADVANCED : own };
        });

    // Published awards only.
    const awards = await this.prisma.leaderboardAward.findMany({
      where: { leaderboardId: board.id, published: true },
      orderBy: { order: 'asc' },
      select: { id: true, title: true, entrantId: true, notes: true },
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
      isHackathon: board.isHackathon,
      revealReviews: board.revealReviews,
      myEntrantIds: [...myEntrantIds],
      rounds: board.rounds.map((r) => ({
        id: r.id,
        name: r.name,
        order: r.order,
        status: r.status,
        entrants: roundEntrants(r).map(({ e, status }) => ({
          id: e.id,
          name: e.name,
          teamCode: e.teamCode,
          isMine: myEntrantIds.has(e.id),
          status,
        })),
      })),
      awards: awards.map((a) => ({
        id: a.id,
        title: a.title,
        entrantId: a.entrantId,
        entrantName: board.entrants.find((e) => e.id === a.entrantId)?.name ?? null,
        teamCode: board.entrants.find((e) => e.id === a.entrantId)?.teamCode ?? null,
        notes: a.notes,
        isMine: myEntrantIds.has(a.entrantId),
      })),
      feedback: myFeedback,
    };
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
