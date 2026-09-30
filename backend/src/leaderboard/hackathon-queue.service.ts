import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { HackathonEvalStatus, LeaderboardPanelistKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardGateway } from './leaderboard.gateway';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonJudgesService } from './hackathon-judges.service';
import { HackathonRoundsService, type RoundContext } from './hackathon-rounds.service';
import { statementView, TEAM_STATEMENT_SELECT } from './hackathon.views';
import {
  OPEN_EVAL_STATUSES,
  SLOT_EVAL_STATUSES,
  editableUntil,
  effectiveStatus,
  estimatedWaitMinutes,
  evaluationsRequired,
  graceEndsAt,
  isEliminated,
  judgeTakesTheme,
  judgmentLocked,
  readLinks,
  takesPart,
  teamStage,
  type EvalStatus,
} from './hackathon.shared';
import type { CallNextDto, PickEvaluatorDto } from './dto/hackathon.dto';

const OPEN = [...OPEN_EVAL_STATUSES] as HackathonEvalStatus[];
const SLOT = [...SLOT_EVAL_STATUSES] as HackathonEvalStatus[];

/** The request columns every queue view needs. */
const REQUEST_SELECT = {
  id: true,
  leaderboardId: true,
  roundId: true,
  entrantId: true,
  judgeUserId: true,
  panelId: true,
  status: true,
  requestedAt: true,
  calledAt: true,
  startedAt: true,
  slotEndsAt: true,
  closedAt: true,
  closedReason: true,
} satisfies Prisma.HackathonEvalRequestSelect;

type RequestRow = Prisma.HackathonEvalRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

/** Who evaluates a request: one judge or one panel. */
interface Evaluator {
  kind: 'JUDGE' | 'PANEL';
  id: string;
  name: string;
  location: string | null;
  meetingUrl: string | null;
  isAvailable: boolean;
  /** Everyone who judges in this queue (the judge, or the panel's members). */
  judgeUserIds: string[];
}

/** Requests in a queue: the judge's own, or a panel's. */
const queueWhere = (e: { kind: 'JUDGE' | 'PANEL'; id: string }): Prisma.HackathonEvalRequestWhereInput =>
  e.kind === 'JUDGE' ? { judgeUserId: e.id } : { panelId: e.id };

/**
 * The evaluation queue (docs/hackathon-mobile-plan.md §7): teams pick a judge
 * or panel and wait; the judge calls the next team, starts the slot, and marks
 * it (LeaderboardService.submitJudgment completes the request); a team that
 * doesn't turn up within the grace time is a no-show. The curator watches every
 * queue live and can remove, move or force-complete a request, and reopen
 * locked marks.
 *
 * Server timestamps are the truth; a 30-second tick moves slots that ran out
 * to AWAITING_MARKS and tells the judge. Every change pings the socket rooms of
 * the curators, the judges and the teams involved so their screens refetch.
 */
@Injectable()
export class HackathonQueueService {
  private readonly logger = new Logger(HackathonQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
    private readonly judges: HackathonJudgesService,
    private readonly rounds: HackathonRoundsService,
    @Inject(forwardRef(() => LeaderboardGateway))
    private readonly gateway: LeaderboardGateway,
  ) {}

  // ══ Team ═══════════════════════════════════════════════════════════════════

  /**
   * The team's evaluate screen: every round with whether the team is in it and
   * how many evaluations it has, the request it has open (position, judge,
   * timings), and its recent evaluations. No marks.
   */
  async getMyEvaluation(userId: string, eventId: string) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    const now = new Date();
    const ctx = await this.rounds.context(board.id);
    const standing = (r: string) => ctx.standing(team.id, r);
    const eliminated = isEliminated(ctx.rounds, standing);
    const stage = teamStage({ cancelled: !!team.cancelledAt, statementLockedAt: team.statementLockedAt, eliminated });

    const requests = await this.prisma.hackathonEvalRequest.findMany({
      where: { entrantId: team.id },
      orderBy: { requestedAt: 'desc' },
      select: REQUEST_SELECT,
    });
    const open = requests.find((r) => OPEN.includes(r.status)) ?? null;
    const evaluators = await this.evaluatorsById(board.id, requests);

    return {
      eventId,
      stage,
      team: { id: team.id, teamCode: team.teamCode, name: team.name },
      rounds: ctx.rounds.map((r) => {
        const part = stage === 'ACTIVE' || stage === 'ELIMINATED' ? takesPart(ctx.rounds, standing, r.id) : { in: false as const, reason: 'NOT_ADVANCED' as const };
        const completed = requests.filter((q) => q.roundId === r.id && q.status === 'COMPLETED').length;
        const required = evaluationsRequired(r);
        return {
          id: r.id,
          name: r.name,
          order: r.order,
          status: r.status,
          kind: r.kind,
          judgingMode: r.judgingMode,
          slotMinutes: r.slotMinutes,
          endAt: r.endAt,
          takesPart: part.in,
          standing: standing(r.id),
          completed,
          required,
          // Can the team join a queue in this round right now?
          canRequest:
            stage === 'ACTIVE' &&
            !open &&
            part.in &&
            standing(r.id) === 'PENDING' &&
            completed < required &&
            this.acceptingRequests(r, now),
          acceptingRequests: this.acceptingRequests(r, now),
        };
      }),
      openRequest: open ? await this.teamRequestView(open, evaluators, ctx, now) : null,
      history: requests
        .filter((r) => !OPEN.includes(r.status))
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          roundName: ctx.rounds.find((x) => x.id === r.roundId)?.name ?? null,
          status: r.status,
          closedReason: r.closedReason,
          evaluatorName: this.evaluatorKey(r) ? evaluators.get(this.evaluatorKey(r)!)?.name ?? null : null,
          closedAt: r.closedAt,
        })),
    };
  }

  /**
   * Who the team can pick in a round (plan §7): for SINGLE / MULTI, the judges
   * on the round whose themes include the team's (or who take any theme); for
   * PANEL, the round's panels. Each with queue length and a rough wait.
   */
  async getEvaluators(userId: string, eventId: string, roundId: string) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    const round = await this.rounds.findRoundOrThrow(board.id, roundId);
    const done = await this.prisma.hackathonEvalRequest.findMany({
      where: { entrantId: team.id, roundId, status: 'COMPLETED' },
      select: { judgeUserId: true },
    });
    const evaluated = new Set(done.map((d) => d.judgeUserId).filter((id): id is string => !!id));
    const list = await this.pickable(board.id, round, team);
    const loads = await this.queueLoads(board.id, list);
    return {
      round: { id: round.id, name: round.name, kind: round.kind, judgingMode: round.judgingMode, slotMinutes: round.slotMinutes },
      evaluators: list
        .map((e) => {
          const load = loads.get(`${e.kind}:${e.id}`) ?? { waiting: 0, busy: false };
          return {
            kind: e.kind,
            id: e.id,
            name: e.name,
            location: e.location,
            online: !!e.meetingUrl,
            isAvailable: e.isAvailable,
            waiting: load.waiting,
            busy: load.busy,
            waitMinutes: estimatedWaitMinutes(load.waiting, load.busy, round.slotMinutes),
            alreadyEvaluated: e.kind === 'JUDGE' && evaluated.has(e.id),
          };
        })
        .sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable) || a.waitMinutes - b.waitMinutes || a.name.localeCompare(b.name)),
    };
  }

  /** Join a judge's or panel's queue. Any team member can; one open request per team. */
  async requestEvaluation(userId: string, eventId: string, roundId: string, dto: PickEvaluatorDto) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    if (team.cancelledAt) throw new BadRequestException('This registration was cancelled.');
    if (!team.statementLockedAt) throw new ForbiddenException('Lock in your problem statement first.');
    const round = await this.rounds.findRoundOrThrow(board.id, roundId);
    const now = new Date();
    if (round.status !== 'ACTIVE') throw new BadRequestException(`${round.name} isn't open.`);
    if (!this.acceptingRequests(round, now)) throw new BadRequestException(`${round.name} has stopped taking new requests.`);

    const ctx = await this.rounds.context(board.id);
    const standing = (r: string) => ctx.standing(team.id, r);
    if (isEliminated(ctx.rounds, standing)) throw new ForbiddenException('Your team’s run has ended.');
    if (!takesPart(ctx.rounds, standing, roundId).in) throw new ForbiddenException(`Your team isn't in ${round.name}.`);
    if (standing(roundId) !== 'PENDING') throw new BadRequestException(`The organisers already decided your team's ${round.name}.`);
    const completed = await this.prisma.hackathonEvalRequest.findMany({
      where: { entrantId: team.id, roundId, status: 'COMPLETED' },
      select: { judgeUserId: true },
    });
    const required = evaluationsRequired(round);
    if (completed.length >= required) {
      throw new BadRequestException(required > 1 ? `Your team already has its ${required} evaluations in ${round.name}.` : `Your team was already evaluated in ${round.name}.`);
    }

    const mentoring = round.kind === 'MENTORING';
    const wantsPanel = !mentoring && round.judgingMode === 'PANEL';
    if (wantsPanel ? !dto.panelId || dto.judgeUserId : !dto.judgeUserId || dto.panelId) {
      throw new BadRequestException(wantsPanel ? 'Pick a panel.' : mentoring ? 'Pick a mentor.' : 'Pick a judge.');
    }
    const choices = await this.pickable(board.id, round, team);
    const chosen = choices.find((c) => c.id === (dto.judgeUserId ?? dto.panelId));
    if (!chosen) {
      throw new BadRequestException(
        wantsPanel
          ? 'That panel isn’t judging this round.'
          : mentoring
            ? 'That mentor isn’t mentoring in this round.'
            : 'That judge isn’t judging your team in this round.',
      );
    }
    if (!chosen.isAvailable) throw new BadRequestException(`${chosen.name} is on a break. Pick someone else or try again soon.`);
    if (chosen.kind === 'JUDGE' && completed.some((c) => c.judgeUserId === chosen.id)) {
      throw new BadRequestException(
        mentoring
          ? `Your team already had a session with ${chosen.name} in this round. Pick another mentor.`
          : `${chosen.name} already evaluated your team in this round. Pick another judge.`,
      );
    }

    const judgeWasIdle = !(await this.prisma.hackathonEvalRequest.count({
      where: { ...queueWhere(chosen), status: { in: OPEN } },
    }));
    try {
      await this.prisma.hackathonEvalRequest.create({
        data: {
          leaderboardId: board.id,
          roundId,
          entrantId: team.id,
          judgeUserId: chosen.kind === 'JUDGE' ? chosen.id : null,
          panelId: chosen.kind === 'PANEL' ? chosen.id : null,
          requestedBy: userId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Your team is already in a queue. Leave it first to pick someone else.');
      }
      throw err;
    }

    this.ping(eventId, chosen.judgeUserIds, [team.id]);
    // The judge hears about it only when nobody else was waiting (they're free).
    if (judgeWasIdle) {
      await this.judges.notifyJudges(eventId, chosen.judgeUserIds, 'QUEUE_JOINED', {
        teamCode: team.teamCode,
        teamName: team.name,
        roundName: round.name,
      });
    }
    return this.getMyEvaluation(userId, eventId);
  }

  /** Leave the queue (waiting, or called but not yet started). */
  async withdraw(userId: string, eventId: string, requestId: string) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    const req = await this.prisma.hackathonEvalRequest.findFirst({
      where: { id: requestId, leaderboardId: board.id, entrantId: team.id },
      select: REQUEST_SELECT,
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'WAITING' && req.status !== 'CALLED') {
      throw new BadRequestException(OPEN.includes(req.status) ? 'Your evaluation has started.' : 'You’re not in this queue any more.');
    }
    await this.closeRequest(eventId, board.id, req, 'WITHDRAWN', { by: userId, from: ['WAITING', 'CALLED'] });
    return this.getMyEvaluation(userId, eventId);
  }

  // ══ Judge ══════════════════════════════════════════════════════════════════

  /**
   * The judge console (plan §12): availability, the team in the current slot
   * (with timings and what to show), who's waiting in each of the judge's
   * queues (their own and their panels'), and what they finished recently with
   * the 5-minute lock countdown. Call next is off while a slot is open.
   */
  async getConsole(userId: string, eventId: string) {
    const board = await this.judgeBoardOrThrow(userId, eventId);
    await this.teams.syncCancellations(board.id);
    await this.expireSlots({ leaderboardId: board.id });
    const now = new Date();

    const [profile, scopes, panels, ctx] = await Promise.all([
      this.ensureProfile(board.id, userId),
      this.prisma.leaderboardPanelist.findMany({
        where: { leaderboardId: board.id, userId },
        select: { roundId: true, kind: true },
      }),
      this.prisma.hackathonPanel.findMany({
        where: { leaderboardId: board.id, members: { some: { userId } } },
        select: { id: true, name: true, location: true, meetingUrl: true, isAvailable: true, roundId: true },
      }),
      this.rounds.context(board.id),
    ]);
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
    const queues: Evaluator[] = [
      {
        kind: 'JUDGE',
        id: userId,
        name: me?.fullName || me?.username || 'You',
        location: profile.location,
        meetingUrl: profile.meetingUrl,
        isAvailable: profile.isAvailable,
        judgeUserIds: [userId],
      },
      ...panels.map((p) => ({
        kind: 'PANEL' as const,
        id: p.id,
        name: p.name,
        location: p.location,
        meetingUrl: p.meetingUrl,
        isAvailable: p.isAvailable,
        judgeUserIds: [userId],
      })),
    ];
    // Judges take evaluation rounds, mentors mentoring rounds.
    const roundKind = profile.kind === 'MENTOR' ? 'MENTORING' : 'EVALUATION';
    const myScopes = scopes.filter((s) => s.kind === profile.kind);
    const allRounds = myScopes.some((s) => s.roundId === null);
    const myRounds = ctx.rounds.filter(
      (r) =>
        r.kind === roundKind &&
        (allRounds || myScopes.some((s) => s.roundId === r.id) || panels.some((p) => p.roundId === null || p.roundId === r.id)),
    );

    const open = await this.prisma.hackathonEvalRequest.findMany({
      where: { leaderboardId: board.id, status: { in: OPEN }, OR: queues.map(queueWhere) },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      select: REQUEST_SELECT,
    });
    const busySlot = open.find((r) => SLOT.includes(r.status)) ?? null;

    const teamIds = [...new Set(open.map((r) => r.entrantId))];
    const teamRows = await this.teamSummaries(teamIds);

    const queueViews = await Promise.all(
      queues.map(async (q) => {
        const mine = open.filter((r) => (q.kind === 'JUDGE' ? r.judgeUserId === q.id : r.panelId === q.id));
        const current = mine.find((r) => SLOT.includes(r.status)) ?? null;
        const waiting = mine.filter((r) => r.status === 'WAITING');
        return {
          kind: q.kind,
          id: q.id,
          name: q.kind === 'PANEL' ? q.name : null,
          location: q.location,
          meetingUrl: q.meetingUrl,
          isAvailable: q.isAvailable,
          current: current ? await this.slotView(current, ctx, userId, now) : null,
          waiting: waiting.map((r, i) => ({
            requestId: r.id,
            position: i + 1,
            roundName: ctx.rounds.find((x) => x.id === r.roundId)?.name ?? null,
            team: teamRows.get(r.entrantId) ?? null,
            requestedAt: r.requestedAt,
          })),
          canCallNext: !busySlot && q.isAvailable && waiting.length > 0,
        };
      }),
    );

    // Recently finished (own queue and panels), with this judge's lock countdown.
    const recent = await this.prisma.hackathonEvalRequest.findMany({
      where: {
        leaderboardId: board.id,
        status: { in: ['COMPLETED', 'NO_SHOW'] },
        OR: queues.map(queueWhere),
      },
      orderBy: { closedAt: 'desc' },
      take: 20,
      select: { ...REQUEST_SELECT, judgments: { where: { panelistUserId: userId }, select: { submittedAt: true, reopenedAt: true } } },
    });
    const recentTeams = await this.teamSummaries(recent.map((r) => r.entrantId).filter((id) => !teamRows.has(id)));

    return {
      eventId,
      // JUDGE gives marks; MENTOR gives feedback only.
      kind: profile.kind,
      isAvailable: profile.isAvailable,
      location: profile.location,
      meetingUrl: profile.meetingUrl,
      rounds: myRounds.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        kind: r.kind,
        judgingMode: r.judgingMode,
        slotMinutes: r.slotMinutes,
        callGraceMinutes: r.callGraceMinutes,
      })),
      // Why Call next is off, when a slot is open somewhere.
      busy: busySlot
        ? {
            requestId: busySlot.id,
            status: effectiveStatus(busySlot, now),
            teamCode: teamRows.get(busySlot.entrantId)?.teamCode ?? null,
          }
        : null,
      queues: queueViews,
      recent: recent.map((r) => {
        const j = r.judgments[0];
        return {
          requestId: r.id,
          status: r.status,
          roundId: r.roundId,
          roundName: ctx.rounds.find((x) => x.id === r.roundId)?.name ?? null,
          team: teamRows.get(r.entrantId) ?? recentTeams.get(r.entrantId) ?? null,
          closedAt: r.closedAt,
          submittedAt: j?.submittedAt ?? null,
          editableUntil: j ? editableUntil(j) : null,
          locked: !!j && judgmentLocked(j, now),
        };
      }),
    };
  }

  async setAvailability(userId: string, eventId: string, isAvailable: boolean) {
    const board = await this.judgeBoardOrThrow(userId, eventId);
    const profile = await this.ensureProfile(board.id, userId);
    await this.prisma.hackathonJudgeProfile.update({ where: { id: profile.id }, data: { isAvailable } });
    this.ping(eventId, [userId], []);
    return this.getConsole(userId, eventId);
  }

  /**
   * Call the team that's waited longest in the judge's queue (or a panel's
   * they sit on). Refused while any slot of theirs is open: marks for the last
   * team come first. The judge's profile row is locked so two taps can't call
   * two teams; a panel's row too, so two panel members can't either.
   */
  async callNext(userId: string, eventId: string, dto: CallNextDto) {
    const board = await this.judgeBoardOrThrow(userId, eventId);
    await this.expireSlots({ leaderboardId: board.id });
    const profile = await this.ensureProfile(board.id, userId);
    let evaluator: Evaluator;
    if (dto.panelId) {
      const panel = await this.prisma.hackathonPanel.findFirst({
        where: { id: dto.panelId, leaderboardId: board.id, members: { some: { userId } } },
        select: { id: true, name: true, location: true, meetingUrl: true, isAvailable: true, members: { select: { userId: true } } },
      });
      if (!panel) throw new NotFoundException('You’re not on that panel.');
      if (!panel.isAvailable) throw new BadRequestException(`${panel.name} is on a break. The organisers can switch it back on.`);
      evaluator = { kind: 'PANEL', ...panel, judgeUserIds: panel.members.map((m) => m.userId) };
    } else {
      if (!profile.isAvailable) throw new BadRequestException('You’re on a break. Switch availability on to call teams.');
      evaluator = {
        kind: 'JUDGE',
        id: userId,
        name: await this.userName(userId),
        location: profile.location,
        meetingUrl: profile.meetingUrl,
        isAvailable: true,
        judgeUserIds: [userId],
      };
    }
    const firstBefore = await this.firstWaiting(board.id, evaluator);

    const called = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM hackathon_judge_profiles WHERE id = ${profile.id}::uuid FOR UPDATE`;
      if (evaluator.kind === 'PANEL') {
        await tx.$queryRaw`SELECT id FROM hackathon_panels WHERE id = ${evaluator.id}::uuid FOR UPDATE`;
      }
      const busy = await tx.hackathonEvalRequest.findFirst({
        where: {
          leaderboardId: board.id,
          status: { in: SLOT },
          OR: [
            { judgeUserId: userId },
            { panel: { members: { some: { userId } } } },
            ...(evaluator.kind === 'PANEL' ? [{ panelId: evaluator.id }] : []),
          ],
        },
        select: { status: true, entrant: { select: { teamCode: true, name: true } } },
      });
      if (busy) {
        const who = busy.entrant.teamCode ?? busy.entrant.name;
        throw new ConflictException(
          busy.status === 'CALLED' ? `${who} is on its way. Start or mark it a no-show first.` : `Submit marks for ${who} before calling the next team.`,
        );
      }
      const next = await tx.hackathonEvalRequest.findFirst({
        where: { leaderboardId: board.id, ...queueWhere(evaluator), status: 'WAITING', round: { status: 'ACTIVE' } },
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        select: REQUEST_SELECT,
      });
      if (!next) throw new BadRequestException('Nobody is waiting right now.');
      const res = await tx.hackathonEvalRequest.updateMany({
        where: { id: next.id, status: 'WAITING' },
        data: { status: 'CALLED', calledAt: new Date() },
      });
      if (!res.count) throw new ConflictException('That team just left the queue. Try again.');
      return next;
    });

    const [team, round] = await Promise.all([
      this.prisma.leaderboardEntrant.findUnique({ where: { id: called.entrantId }, select: { id: true, name: true, teamCode: true } }),
      this.prisma.leaderboardRound.findUnique({ where: { id: called.roundId }, select: { name: true } }),
    ]);
    if (team) {
      await this.teams.notify(eventId, [team], 'QUEUE_CALLED', {
        roundName: round?.name,
        evaluatorName: evaluator.name,
        location: evaluator.location,
        meetingUrl: evaluator.meetingUrl,
      });
    }
    await this.announceNewFirst(eventId, board.id, evaluator, firstBefore);
    this.ping(eventId, evaluator.judgeUserIds, [called.entrantId]);
    return this.getConsole(userId, eventId);
  }

  /** The team is here: the slot starts and runs for the round's slot length. */
  async start(userId: string, eventId: string, requestId: string) {
    const board = await this.judgeBoardOrThrow(userId, eventId);
    const req = await this.judgeRequestOrThrow(board.id, userId, requestId);
    if (req.status !== 'CALLED') throw new BadRequestException(req.status === 'WAITING' ? 'Call the team first.' : 'This slot has already started.');
    const round = await this.rounds.findRoundOrThrow(board.id, req.roundId);
    const now = new Date();
    const res = await this.prisma.hackathonEvalRequest.updateMany({
      where: { id: req.id, status: 'CALLED' },
      data: { status: 'IN_PROGRESS', startedAt: now, slotEndsAt: new Date(now.getTime() + round.slotMinutes * 60_000) },
    });
    if (!res.count) throw new ConflictException('This request changed. Refresh and try again.');
    this.ping(eventId, await this.requestJudgeIds(req), [req.entrantId]);
    return this.getConsole(userId, eventId);
  }

  /** The called team didn't come within the grace time: close it; the team can queue again. */
  async noShow(userId: string, eventId: string, requestId: string) {
    const board = await this.judgeBoardOrThrow(userId, eventId);
    const req = await this.judgeRequestOrThrow(board.id, userId, requestId);
    if (req.status !== 'CALLED') throw new BadRequestException('Only a called team that hasn’t started can be a no-show.');
    const round = await this.rounds.findRoundOrThrow(board.id, req.roundId);
    const graceEnd = graceEndsAt(req.calledAt, round.callGraceMinutes);
    if (graceEnd && graceEnd.getTime() > Date.now()) {
      const mins = Math.ceil((graceEnd.getTime() - Date.now()) / 60_000);
      throw new BadRequestException(`Give them ${mins} more minute${mins === 1 ? '' : 's'} to arrive.`);
    }
    await this.closeRequest(eventId, board.id, req, 'NO_SHOW', { by: userId, from: ['CALLED'], notify: 'QUEUE_NO_SHOW' });
    return this.getConsole(userId, eventId);
  }

  // ══ Curator ════════════════════════════════════════════════════════════════

  /**
   * Live queue monitor: every judge and panel with the team in their slot and
   * who's waiting, plus recently finished evaluations with each judge's lock
   * state (to reopen marks).
   */
  async getQueues(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    await this.expireSlots({ leaderboardId: board.id });
    const now = new Date();
    const ctx = await this.rounds.context(board.id);

    const [profiles, panels, open, recent] = await Promise.all([
      this.prisma.hackathonJudgeProfile.findMany({ where: { leaderboardId: board.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.hackathonPanel.findMany({
        where: { leaderboardId: board.id },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, location: true, meetingUrl: true, isAvailable: true, members: { select: { userId: true } } },
      }),
      this.prisma.hackathonEvalRequest.findMany({
        where: { leaderboardId: board.id, status: { in: OPEN } },
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        select: REQUEST_SELECT,
      }),
      this.prisma.hackathonEvalRequest.findMany({
        where: { leaderboardId: board.id, status: { in: ['COMPLETED', 'NO_SHOW'] } },
        orderBy: { closedAt: 'desc' },
        take: 30,
        select: {
          ...REQUEST_SELECT,
          judgments: { select: { id: true, panelistUserId: true, submittedAt: true, reopenedAt: true } },
        },
      }),
    ]);
    const userIds = [
      ...new Set([
        ...profiles.map((p) => p.userId),
        ...panels.flatMap((p) => p.members.map((m) => m.userId)),
        ...recent.flatMap((r) => r.judgments.map((j) => j.panelistUserId)),
      ]),
    ];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, username: true } });
    const nameOf = (id: string) => {
      const u = users.find((x) => x.id === id);
      return u?.fullName || u?.username || 'Judge';
    };
    const teamRows = await this.teamSummaries([...new Set([...open, ...recent].map((r) => r.entrantId))]);

    const queue = async (
      kind: 'JUDGE' | 'PANEL',
      id: string,
      extra: { name: string; location: string | null; isAvailable: boolean; judgeId?: string; role?: 'JUDGE' | 'MENTOR' },
    ) => {
      const mine = open.filter((r) => (kind === 'JUDGE' ? r.judgeUserId === id : r.panelId === id));
      const current = mine.find((r) => SLOT.includes(r.status));
      return {
        kind,
        id,
        // The profile id, to pause a judge through the judges route.
        judgeId: extra.judgeId ?? null,
        role: extra.role ?? 'JUDGE',
        name: extra.name,
        location: extra.location,
        isAvailable: extra.isAvailable,
        current: current ? await this.monitorSlot(current, ctx, teamRows, now) : null,
        waiting: mine
          .filter((r) => r.status === 'WAITING')
          .map((r, i) => ({
            requestId: r.id,
            position: i + 1,
            roundName: ctx.rounds.find((x) => x.id === r.roundId)?.name ?? null,
            team: teamRows.get(r.entrantId) ?? null,
            requestedAt: r.requestedAt,
          })),
      };
    };

    return {
      activeRounds: ctx.rounds.filter((r) => r.status === 'ACTIVE').map((r) => ({ id: r.id, name: r.name, judgingMode: r.judgingMode })),
      queues: [
        ...(await Promise.all(
          profiles.map((p) =>
            queue('JUDGE', p.userId, { name: nameOf(p.userId), location: p.location, isAvailable: p.isAvailable, judgeId: p.id, role: p.kind }),
          ),
        )),
        ...(await Promise.all(panels.map((p) => queue('PANEL', p.id, { name: p.name, location: p.location, isAvailable: p.isAvailable })))),
      ],
      recent: recent.map((r) => ({
        requestId: r.id,
        status: r.status,
        roundName: ctx.rounds.find((x) => x.id === r.roundId)?.name ?? null,
        roundActive: ctx.rounds.find((x) => x.id === r.roundId)?.status === 'ACTIVE',
        team: teamRows.get(r.entrantId) ?? null,
        closedAt: r.closedAt,
        closedReason: r.closedReason,
        judgments: r.judgments
          .filter((j) => j.submittedAt)
          .map((j) => ({
            id: j.id,
            judgeName: nameOf(j.panelistUserId),
            submittedAt: j.submittedAt,
            editableUntil: editableUntil(j),
            locked: judgmentLocked(j, now),
          })),
      })),
    };
  }

  /** Take a team out of a queue (it can join again). */
  async removeRequest(userId: string, eventId: string, requestId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const req = await this.requestOnBoardOrThrow(board.id, requestId);
    if (!OPEN.includes(req.status)) throw new BadRequestException('This team isn’t in a queue any more.');
    await this.closeRequest(eventId, board.id, req, 'CANCELLED', { by: userId, from: OPEN, reason: 'REMOVED', notify: 'QUEUE_REMOVED' });
    return this.getQueues(userId, eventId);
  }

  /**
   * Move a waiting (or called, not started) team to another judge or panel.
   * It keeps its request time, so it keeps its place in time in the new queue.
   * The curator may pick any judge on the round, whatever their themes.
   */
  async reassignRequest(userId: string, eventId: string, requestId: string, dto: PickEvaluatorDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const req = await this.requestOnBoardOrThrow(board.id, requestId);
    if (req.status !== 'WAITING' && req.status !== 'CALLED') {
      throw new BadRequestException('Only a team that hasn’t started can be moved.');
    }
    const round = await this.rounds.findRoundOrThrow(board.id, req.roundId);
    const team = await this.prisma.leaderboardEntrant.findUniqueOrThrow({
      where: { id: req.entrantId },
      select: { id: true, name: true, teamCode: true, themeId: true },
    });
    const choices = await this.pickable(board.id, round, { id: team.id, themeId: null });
    const target = choices.find((c) => c.id === (dto.judgeUserId ?? dto.panelId) && c.kind === (dto.panelId ? 'PANEL' : 'JUDGE'));
    if (!target) {
      throw new BadRequestException(
        round.kind === 'MENTORING' ? 'Pick a mentor on this round.' : round.judgingMode === 'PANEL' ? 'Pick a panel on this round.' : 'Pick a judge on this round.',
      );
    }
    if (target.id === (req.judgeUserId ?? req.panelId)) throw new BadRequestException('The team is already in that queue.');
    if (target.kind === 'JUDGE') {
      const judged = await this.prisma.hackathonEvalRequest.count({
        where: { entrantId: team.id, roundId: round.id, judgeUserId: target.id, status: 'COMPLETED' },
      });
      if (judged) throw new BadRequestException(`${target.name} already evaluated this team in this round.`);
    }
    const from = await this.evaluatorFor(req);
    const firstBefore = from ? await this.firstWaiting(board.id, from) : null;
    const targetWasIdle = !(await this.prisma.hackathonEvalRequest.count({ where: { ...queueWhere(target), status: { in: OPEN } } }));

    const res = await this.prisma.hackathonEvalRequest.updateMany({
      where: { id: req.id, status: { in: ['WAITING', 'CALLED'] } },
      data: {
        judgeUserId: target.kind === 'JUDGE' ? target.id : null,
        panelId: target.kind === 'PANEL' ? target.id : null,
        status: 'WAITING',
        calledAt: null,
      },
    });
    if (!res.count) throw new ConflictException('The slot just started. Refresh and try again.');

    await this.teams.notify(eventId, [team], 'QUEUE_MOVED', { roundName: round.name, evaluatorName: target.name });
    if (targetWasIdle) {
      await this.judges.notifyJudges(eventId, target.judgeUserIds, 'QUEUE_JOINED', { teamCode: team.teamCode, teamName: team.name, roundName: round.name });
    }
    if (from) await this.announceNewFirst(eventId, board.id, from, firstBefore);
    this.ping(eventId, [...target.judgeUserIds, ...(from?.judgeUserIds ?? [])], [team.id]);
    return this.getQueues(userId, eventId);
  }

  /**
   * Finish a slot that can't finish by itself, e.g. a panel judge who left.
   * Marks already submitted count; nobody else can add theirs afterwards.
   */
  async forceComplete(userId: string, eventId: string, requestId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const req = await this.requestOnBoardOrThrow(board.id, requestId);
    if (!SLOT.includes(req.status)) throw new BadRequestException('Only a called or running slot can be completed.');
    await this.closeRequest(eventId, board.id, req, 'COMPLETED', { by: userId, from: SLOT, reason: 'FORCED' });
    return this.getQueues(userId, eventId);
  }

  /**
   * Give a judge another 5 minutes on marks they submitted (plan §3 #10). The
   * curator never edits marks; the reopen is recorded (who, when).
   */
  async reopenJudgment(userId: string, eventId: string, judgmentId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const judgment = await this.prisma.leaderboardJudgment.findFirst({
      where: { id: judgmentId, entrant: { leaderboardId: board.id } },
      select: {
        id: true,
        panelistUserId: true,
        submittedAt: true,
        round: { select: { name: true, status: true } },
        entrant: { select: { teamCode: true, name: true } },
      },
    });
    if (!judgment) throw new NotFoundException('Marks not found');
    if (!judgment.submittedAt) throw new BadRequestException('These marks haven’t been submitted yet, so they’re still open.');
    if (judgment.round.status !== 'ACTIVE') throw new BadRequestException(`${judgment.round.name} is closed. Open it again to reopen marks.`);
    await this.prisma.leaderboardJudgment.update({
      where: { id: judgment.id },
      data: { reopenedAt: new Date(), reopenedBy: userId },
    });
    await this.judges.notifyJudges(eventId, [judgment.panelistUserId], 'MARKS_REOPENED', {
      teamCode: judgment.entrant.teamCode,
      teamName: judgment.entrant.name,
      roundName: judgment.round.name,
    });
    this.ping(eventId, [judgment.panelistUserId], []);
    return this.getQueues(userId, eventId);
  }

  // ══ Slot timer ═════════════════════════════════════════════════════════════

  /** Every 30 seconds: running slots whose time is up wait for marks, and their judges are told. */
  @Interval(30_000)
  async tick(): Promise<void> {
    try {
      await this.expireSlots({});
    } catch (err) {
      this.logger.warn(`Slot expiry failed: ${(err as Error).message}`);
    }
  }

  /**
   * Move ran-out IN_PROGRESS slots to AWAITING_MARKS. Each row is claimed with
   * a conditional update, so with several backend replicas only one tells the
   * judge "Time's up".
   */
  async expireSlots(where: { leaderboardId?: string }): Promise<void> {
    const now = new Date();
    const due = await this.prisma.hackathonEvalRequest.findMany({
      where: { ...where, status: 'IN_PROGRESS', slotEndsAt: { lte: now } },
      take: 200,
      select: {
        ...REQUEST_SELECT,
        leaderboard: { select: { eventId: true } },
        entrant: { select: { teamCode: true, name: true } },
        round: { select: { name: true } },
      },
    });
    for (const r of due) {
      const res = await this.prisma.hackathonEvalRequest.updateMany({
        where: { id: r.id, status: 'IN_PROGRESS' },
        data: { status: 'AWAITING_MARKS' },
      });
      if (!res.count) continue;
      const judgeIds = await this.requestJudgeIds(r);
      // Panel members who already submitted don't need the nudge.
      const submitted = await this.prisma.leaderboardJudgment.findMany({
        where: { requestId: r.id, submittedAt: { not: null } },
        select: { panelistUserId: true },
      });
      const done = new Set(submitted.map((s) => s.panelistUserId));
      await this.judges.notifyJudges(
        r.leaderboard.eventId,
        judgeIds.filter((id) => !done.has(id)),
        'TIME_UP',
        { teamCode: r.entrant.teamCode, teamName: r.entrant.name, roundName: r.round.name },
      );
      this.ping(r.leaderboard.eventId, judgeIds, [r.entrantId]);
    }
  }

  // ══ Helpers ════════════════════════════════════════════════════════════════

  private acceptingRequests(round: { status: string; endAt: Date | null }, now: Date) {
    return round.status === 'ACTIVE' && (!round.endAt || round.endAt.getTime() > now.getTime());
  }

  private ping(eventId: string, judgeUserIds: string[], entrantIds: string[]) {
    this.gateway.hackathonChanged(eventId, { judgeUserIds, entrantIds });
  }

  private async myTeamOrThrow(userId: string, eventId: string) {
    const board = await this.teams.getBoardOrThrow(eventId);
    if (!board.enabled) throw new NotFoundException('Hackathon mode is not on for this event');
    const team = await this.teams.findMyTeam(board.id, eventId, userId);
    if (!team) throw new NotFoundException("You're not on a team for this hackathon");
    const extra = await this.prisma.leaderboardEntrant.findUniqueOrThrow({ where: { id: team.id }, select: { themeId: true } });
    return { board, team: { ...team, themeId: extra.themeId } };
  }

  /** The hackathon board for a judge on it (404 otherwise, or while switched off). */
  private async judgeBoardOrThrow(userId: string, eventId: string) {
    const board = await this.teams.getBoardOrThrow(eventId);
    if (!board.enabled) throw new NotFoundException('Hackathon mode is not on for this event');
    const onPanel = await this.prisma.leaderboardPanelist.count({
      where: { leaderboardId: board.id, userId },
    });
    if (!onPanel) throw new ForbiddenException('You’re not judging or mentoring at this hackathon.');
    return board;
  }

  private async ensureProfile(leaderboardId: string, userId: string) {
    const existing = await this.prisma.hackathonJudgeProfile.findUnique({
      where: { leaderboardId_userId: { leaderboardId, userId } },
    });
    if (existing) return existing;
    // Added the old way: a mentor only if they have no judge rows.
    const judgeRows = await this.prisma.leaderboardPanelist.count({
      where: { leaderboardId, userId, kind: LeaderboardPanelistKind.JUDGE },
    });
    return this.prisma.hackathonJudgeProfile.upsert({
      where: { leaderboardId_userId: { leaderboardId, userId } },
      create: { leaderboardId, userId, kind: judgeRows ? 'JUDGE' : 'MENTOR', themeIds: [] },
      update: {},
    });
  }

  private async userName(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
    return u?.fullName || u?.username || 'Your judge';
  }

  /** A request in this judge's own queue or one of their panels'. */
  private async judgeRequestOrThrow(leaderboardId: string, userId: string, requestId: string) {
    const req = await this.prisma.hackathonEvalRequest.findFirst({
      where: {
        id: requestId,
        leaderboardId,
        OR: [{ judgeUserId: userId }, { panel: { members: { some: { userId } } } }],
      },
      select: REQUEST_SELECT,
    });
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }

  private async requestOnBoardOrThrow(leaderboardId: string, requestId: string) {
    const req = await this.prisma.hackathonEvalRequest.findFirst({ where: { id: requestId, leaderboardId }, select: REQUEST_SELECT });
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }

  /** The judges behind a request: its judge, or its panel's members. */
  private async requestJudgeIds(r: { judgeUserId: string | null; panelId: string | null }): Promise<string[]> {
    if (r.judgeUserId) return [r.judgeUserId];
    if (!r.panelId) return [];
    const members = await this.prisma.hackathonPanelMember.findMany({ where: { panelId: r.panelId }, select: { userId: true } });
    return members.map((m) => m.userId);
  }

  private evaluatorKey(r: { judgeUserId: string | null; panelId: string | null }) {
    return r.judgeUserId ? `JUDGE:${r.judgeUserId}` : r.panelId ? `PANEL:${r.panelId}` : null;
  }

  private async evaluatorFor(r: { judgeUserId: string | null; panelId: string | null; leaderboardId: string }): Promise<Evaluator | null> {
    const map = await this.evaluatorsById(r.leaderboardId, [r]);
    const key = this.evaluatorKey(r);
    return key ? map.get(key) ?? null : null;
  }

  /** Judges and panels behind these requests, keyed "JUDGE:<userId>" / "PANEL:<panelId>". */
  private async evaluatorsById(
    leaderboardId: string,
    requests: { judgeUserId: string | null; panelId: string | null }[],
  ): Promise<Map<string, Evaluator>> {
    const judgeIds = [...new Set(requests.map((r) => r.judgeUserId).filter((id): id is string => !!id))];
    const panelIds = [...new Set(requests.map((r) => r.panelId).filter((id): id is string => !!id))];
    const [users, profiles, panels] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: judgeIds } }, select: { id: true, fullName: true, username: true } }),
      this.prisma.hackathonJudgeProfile.findMany({
        where: { userId: { in: judgeIds }, leaderboardId },
        select: { userId: true, location: true, meetingUrl: true, isAvailable: true },
      }),
      this.prisma.hackathonPanel.findMany({
        where: { id: { in: panelIds }, leaderboardId },
        select: { id: true, name: true, location: true, meetingUrl: true, isAvailable: true, members: { select: { userId: true } } },
      }),
    ]);
    const out = new Map<string, Evaluator>();
    for (const id of judgeIds) {
      const u = users.find((x) => x.id === id);
      const p = profiles.find((x) => x.userId === id);
      out.set(`JUDGE:${id}`, {
        kind: 'JUDGE',
        id,
        name: u?.fullName || u?.username || 'Judge',
        location: p?.location ?? null,
        meetingUrl: p?.meetingUrl ?? null,
        isAvailable: p?.isAvailable ?? true,
        judgeUserIds: [id],
      });
    }
    for (const p of panels) {
      out.set(`PANEL:${p.id}`, { kind: 'PANEL', ...p, judgeUserIds: p.members.map((m) => m.userId) });
    }
    return out;
  }

  /**
   * Judges or panels a team can pick in a round. SINGLE / MULTI: judges on the
   * round (and on this team, for old per-team scopes) who take its theme.
   * PANEL: the round's panels with at least one member. Pass `themeId: null`
   * to ignore themes (the curator moving a team).
   */
  private async pickable(
    leaderboardId: string,
    round: { id: string; kind: 'EVALUATION' | 'MENTORING'; judgingMode: 'SINGLE' | 'PANEL' | 'MULTI' },
    team: { id: string; themeId: string | null },
  ): Promise<Evaluator[]> {
    if (round.kind === 'EVALUATION' && round.judgingMode === 'PANEL') {
      const panels = await this.prisma.hackathonPanel.findMany({
        where: { leaderboardId, OR: [{ roundId: null }, { roundId: round.id }], members: { some: {} } },
        select: { id: true, name: true, location: true, meetingUrl: true, isAvailable: true, members: { select: { userId: true } } },
      });
      return panels.map((p) => ({ kind: 'PANEL' as const, ...p, judgeUserIds: p.members.map((m) => m.userId) }));
    }
    const scopes = await this.prisma.leaderboardPanelist.findMany({
      where: {
        leaderboardId,
        // Mentoring rounds are for mentors, evaluation rounds for judges.
        kind: round.kind === 'MENTORING' ? LeaderboardPanelistKind.MENTOR : LeaderboardPanelistKind.JUDGE,
        AND: [{ OR: [{ roundId: null }, { roundId: round.id }] }, { OR: [{ entrantId: null }, { entrantId: team.id }] }],
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const ids = scopes.map((s) => s.userId);
    if (!ids.length) return [];
    const map = await this.evaluatorsById(leaderboardId, ids.map((id) => ({ judgeUserId: id, panelId: null })));
    const profiles = await this.prisma.hackathonJudgeProfile.findMany({
      where: { leaderboardId, userId: { in: ids } },
      select: { userId: true, themeIds: true },
    });
    return ids
      .filter((id) => judgeTakesTheme(profiles.find((p) => p.userId === id)?.themeIds ?? [], team.themeId))
      .map((id) => map.get(`JUDGE:${id}`)!)
      .filter(Boolean);
  }

  /** How many teams wait in each queue and whether a slot is open. */
  private async queueLoads(leaderboardId: string, evaluators: Evaluator[]) {
    const open = await this.prisma.hackathonEvalRequest.findMany({
      where: { leaderboardId, status: { in: OPEN }, OR: evaluators.length ? evaluators.map(queueWhere) : [{ id: '00000000-0000-0000-0000-000000000000' }] },
      select: { judgeUserId: true, panelId: true, status: true },
    });
    const out = new Map<string, { waiting: number; busy: boolean }>();
    for (const e of evaluators) {
      const mine = open.filter((r) => (e.kind === 'JUDGE' ? r.judgeUserId === e.id : r.panelId === e.id));
      out.set(`${e.kind}:${e.id}`, {
        waiting: mine.filter((r) => r.status === 'WAITING').length,
        busy: mine.some((r) => SLOT.includes(r.status)),
      });
    }
    return out;
  }

  private async firstWaiting(leaderboardId: string, e: { kind: 'JUDGE' | 'PANEL'; id: string }) {
    const first = await this.prisma.hackathonEvalRequest.findFirst({
      where: { leaderboardId, ...queueWhere(e), status: 'WAITING' },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return first?.id ?? null;
  }

  /** Tell the team now first in line that it's next, if that changed. */
  private async announceNewFirst(eventId: string, leaderboardId: string, e: Evaluator, before: string | null) {
    const first = await this.prisma.hackathonEvalRequest.findFirst({
      where: { leaderboardId, ...queueWhere(e), status: 'WAITING' },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, entrant: { select: { id: true, name: true, teamCode: true } }, round: { select: { name: true } } },
    });
    if (!first || first.id === before) return;
    await this.teams.notify(eventId, [first.entrant], 'QUEUE_NEXT', {
      roundName: first.round.name,
      evaluatorName: e.name,
      location: e.location,
    });
  }

  /**
   * Close an open request (withdrawn, no-show, removed, force-completed), tell
   * the team if asked, tell the next team in line, and ping everyone involved.
   */
  private async closeRequest(
    eventId: string,
    leaderboardId: string,
    req: RequestRow,
    status: HackathonEvalStatus,
    opts: { by: string; from: HackathonEvalStatus[]; reason?: string; notify?: 'QUEUE_NO_SHOW' | 'QUEUE_REMOVED' },
  ) {
    const evaluator = await this.evaluatorFor(req);
    const firstBefore = evaluator ? await this.firstWaiting(leaderboardId, evaluator) : null;
    const res = await this.prisma.hackathonEvalRequest.updateMany({
      where: { id: req.id, status: { in: opts.from } },
      data: { status, closedAt: new Date(), closedBy: opts.by, closedReason: opts.reason ?? null },
    });
    if (!res.count) throw new ConflictException('This request just changed. Refresh and try again.');
    if (opts.notify) {
      const [team, round] = await Promise.all([
        this.prisma.leaderboardEntrant.findUnique({ where: { id: req.entrantId }, select: { id: true, name: true, teamCode: true } }),
        this.prisma.leaderboardRound.findUnique({ where: { id: req.roundId }, select: { name: true } }),
      ]);
      if (team) await this.teams.notify(eventId, [team], opts.notify, { roundName: round?.name, evaluatorName: evaluator?.name });
    }
    if (evaluator) await this.announceNewFirst(eventId, leaderboardId, evaluator, firstBefore);
    this.ping(eventId, evaluator?.judgeUserIds ?? [], [req.entrantId]);
  }

  /** Team ID, name and theme for queue lists. */
  private async teamSummaries(ids: string[]) {
    if (!ids.length) return new Map<string, { id: string; teamCode: string | null; name: string; themeLabel: string | null }>();
    const rows = await this.prisma.leaderboardEntrant.findMany({
      where: { id: { in: ids } },
      select: { id: true, teamCode: true, name: true, themeText: true, theme: { select: { name: true } }, statement: { select: { theme: { select: { name: true } } } } },
    });
    return new Map(
      rows.map((t) => [
        t.id,
        { id: t.id, teamCode: t.teamCode, name: t.name, themeLabel: t.theme?.name ?? t.statement?.theme?.name ?? t.themeText ?? null },
      ]),
    );
  }

  /** The judge's current slot: the team (names only), its statement, timings and marking progress. */
  private async slotView(r: RequestRow, ctx: RoundContext, userId: string, now: Date) {
    const round = ctx.rounds.find((x) => x.id === r.roundId);
    const [team, mine, panelProgress, submission] = await Promise.all([
      this.prisma.leaderboardEntrant.findUnique({
        where: { id: r.entrantId },
        select: { id: true, teamCode: true, name: true, registrationId: true, room: { select: { name: true, location: true } }, ...TEAM_STATEMENT_SELECT },
      }),
      this.prisma.leaderboardJudgment.findFirst({
        where: { entrantId: r.entrantId, roundId: r.roundId, panelistUserId: userId },
        select: { submittedAt: true, reopenedAt: true },
      }),
      r.panelId
        ? Promise.all([
            this.prisma.hackathonPanelMember.count({ where: { panelId: r.panelId } }),
            this.prisma.leaderboardJudgment.count({ where: { requestId: r.id, submittedAt: { not: null } } }),
          ])
        : Promise.resolve(null),
      this.prisma.hackathonSubmission.findUnique({
        where: { entrantId_roundId: { entrantId: r.entrantId, roundId: r.roundId } },
        select: { links: true, notes: true },
      }),
    ]);
    return {
      requestId: r.id,
      status: effectiveStatus(r as { status: EvalStatus; slotEndsAt: Date | null }, now),
      round: round ? { id: round.id, name: round.name, slotMinutes: round.slotMinutes, callGraceMinutes: round.callGraceMinutes } : null,
      team: team
        ? {
            id: team.id,
            teamCode: team.teamCode,
            name: team.name,
            members: team.registrationId ? await this.leaderboard.teamMemberNames(team.registrationId) : [],
            room: team.room,
            statement: statementView(team),
            // The team's project links for this round.
            links: readLinks(submission?.links),
            linksNotes: submission?.notes ?? null,
          }
        : null,
      calledAt: r.calledAt,
      graceEndsAt: round ? graceEndsAt(r.calledAt, round.callGraceMinutes) : null,
      startedAt: r.startedAt,
      slotEndsAt: r.slotEndsAt,
      myMarks: mine ? { submittedAt: mine.submittedAt, editableUntil: editableUntil(mine) } : null,
      panelProgress: panelProgress ? { total: panelProgress[0], submitted: panelProgress[1] } : null,
    };
  }

  private async monitorSlot(
    r: RequestRow,
    ctx: RoundContext,
    teamRows: Map<string, { id: string; teamCode: string | null; name: string; themeLabel: string | null }>,
    now: Date,
  ) {
    const round = ctx.rounds.find((x) => x.id === r.roundId);
    return {
      requestId: r.id,
      status: effectiveStatus(r as { status: EvalStatus; slotEndsAt: Date | null }, now),
      roundName: round?.name ?? null,
      team: teamRows.get(r.entrantId) ?? null,
      calledAt: r.calledAt,
      startedAt: r.startedAt,
      slotEndsAt: r.slotEndsAt,
    };
  }

  /** The team's open request: where it is in line and who it's waiting for. */
  private async teamRequestView(r: RequestRow, evaluators: Map<string, Evaluator>, ctx: RoundContext, now: Date) {
    const key = this.evaluatorKey(r);
    const e = key ? evaluators.get(key) : undefined;
    const round = ctx.rounds.find((x) => x.id === r.roundId);
    const status = effectiveStatus(r as { status: EvalStatus; slotEndsAt: Date | null }, now);
    let ahead = 0;
    let busy = false;
    if (e && status === 'WAITING') {
      const [before, slot] = await Promise.all([
        this.prisma.hackathonEvalRequest.count({
          where: {
            ...queueWhere(e),
            status: 'WAITING',
            OR: [{ requestedAt: { lt: r.requestedAt } }, { requestedAt: r.requestedAt, id: { lt: r.id } }],
          },
        }),
        this.prisma.hackathonEvalRequest.count({ where: { ...queueWhere(e), status: { in: SLOT } } }),
      ]);
      ahead = before;
      busy = slot > 0;
    }
    const called = status !== 'WAITING';
    return {
      id: r.id,
      roundId: r.roundId,
      roundName: round?.name ?? null,
      status,
      position: status === 'WAITING' ? ahead + 1 : null,
      waitMinutes: status === 'WAITING' && round ? estimatedWaitMinutes(ahead, busy, round.slotMinutes) : null,
      evaluator: e
        ? {
            kind: e.kind,
            name: e.name,
            location: e.location,
            // The call link only once the team is called.
            meetingUrl: called ? e.meetingUrl : null,
            online: !!e.meetingUrl,
          }
        : null,
      requestedAt: r.requestedAt,
      calledAt: r.calledAt,
      graceEndsAt: round ? graceEndsAt(r.calledAt, round.callGraceMinutes) : null,
      startedAt: r.startedAt,
      slotEndsAt: r.slotEndsAt,
    };
  }
}
