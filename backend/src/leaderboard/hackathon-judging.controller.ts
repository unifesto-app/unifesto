import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HackathonJudgesService } from './hackathon-judges.service';
import { HackathonRoundsService } from './hackathon-rounds.service';
import { HackathonQueueService } from './hackathon-queue.service';
import {
  SetRoundDecisionsDto,
  AddHackathonJudgeDto,
  CallNextDto,
  CreateHackathonPanelDto,
  CreateHackathonRoundDto,
  JudgeAvailabilityDto,
  ForceCompleteDto,
  PickEvaluatorDto,
  SetHackathonRoundStatusDto,
  SetTeamRoundDecisionDto,
  UpdateHackathonJudgeDto,
  UpdateHackathonPanelDto,
  UpdateHackathonRoundDto,
  UpsertCriterionDto,
} from './dto/hackathon.dto';

/**
 * Hackathon mode, judging side (E11): rounds and criteria, judges and panels,
 * the live queues, the judge console, and a team asking to be evaluated.
 *
 * Curator routes live under `events/:eventId/hackathon` and are gated by
 * `event:manage-leaderboard` in the services; team routes live under
 * `hackathon/:eventId` and are gated by team membership. Same routes as the one
 * controller they were split from.
 */
@ApiTags('Hackathon')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class HackathonJudgingController {
  constructor(
    private readonly judges: HackathonJudgesService,
    private readonly rounds: HackathonRoundsService,
    private readonly queue: HackathonQueueService,
  ) {}

  // ── Curator: rounds & criteria ────────────────────────────────────────────

  @Get('events/:eventId/hackathon/rounds')
  @ApiOperation({ summary: 'Rounds with settings and progress' })
  listRounds(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.rounds.listRounds(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/rounds')
  createRound(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateHackathonRoundDto,
  ) {
    return this.rounds.createRound(user.id, eventId, dto);
  }

  @Get('events/:eventId/hackathon/rounds/:roundId')
  @ApiOperation({ summary: 'A round: settings, criteria, its teams (no marks), what blocks opening it' })
  getRound(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ) {
    return this.rounds.getRound(user.id, eventId, roundId);
  }

  @Patch('events/:eventId/hackathon/rounds/:roundId')
  updateRound(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: UpdateHackathonRoundDto,
  ) {
    return this.rounds.updateRound(user.id, eventId, roundId, dto);
  }

  @Delete('events/:eventId/hackathon/rounds/:roundId')
  deleteRound(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ) {
    return this.rounds.deleteRound(user.id, eventId, roundId);
  }

  @Post('events/:eventId/hackathon/rounds/:roundId/status')
  @ApiOperation({ summary: 'Open, pause or close a round' })
  setRoundStatus(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: SetHackathonRoundStatusDto,
  ) {
    return this.rounds.setStatus(user.id, eventId, roundId, dto);
  }

  @Put('events/:eventId/hackathon/rounds/:roundId/teams/:entrantId/decision')
  @ApiOperation({ summary: 'Advance or eliminate a team in a round' })
  setTeamDecision(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
    @Body() dto: SetTeamRoundDecisionDto,
  ) {
    return this.rounds.setTeamDecision(user.id, eventId, roundId, entrantId, dto);
  }

  @Put('events/:eventId/hackathon/rounds/:roundId/decisions')
  @ApiOperation({ summary: 'Advance / eliminate several teams at once (the "top N" helper)' })
  setDecisions(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: SetRoundDecisionsDto,
  ) {
    return this.rounds.setDecisions(user.id, eventId, roundId, dto);
  }

  // ── Curator: criteria ─────────────────────────────────────────────────────

  @Post('events/:eventId/hackathon/rounds/:roundId/criteria')
  addCriterion(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: UpsertCriterionDto,
  ) {
    return this.rounds.upsertCriterion(user.id, eventId, roundId, null, dto);
  }

  @Patch('events/:eventId/hackathon/rounds/:roundId/criteria/:metricId')
  updateCriterion(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('metricId', ParseUUIDPipe) metricId: string,
    @Body() dto: UpsertCriterionDto,
  ) {
    return this.rounds.upsertCriterion(user.id, eventId, roundId, metricId, dto);
  }

  @Delete('events/:eventId/hackathon/rounds/:roundId/criteria/:metricId')
  deleteCriterion(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('metricId', ParseUUIDPipe) metricId: string,
  ) {
    return this.rounds.deleteCriterion(user.id, eventId, roundId, metricId);
  }

  // ── Curator: judges & panels ──────────────────────────────────────────────

  @Get('events/:eventId/hackathon/judges')
  listJudges(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.judges.listJudges(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/judges')
  @ApiOperation({ summary: 'Add a judge by phone number or email (finds or creates the account)' })
  addJudge(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: AddHackathonJudgeDto,
  ) {
    return this.judges.addJudge(user.id, eventId, dto);
  }

  @Get('events/:eventId/hackathon/judges/:judgeId')
  getJudge(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('judgeId', ParseUUIDPipe) judgeId: string,
  ) {
    return this.judges.getJudge(user.id, eventId, judgeId);
  }

  @Patch('events/:eventId/hackathon/judges/:judgeId')
  @ApiOperation({ summary: 'Themes, location or call link, rounds, availability' })
  updateJudge(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('judgeId', ParseUUIDPipe) judgeId: string,
    @Body() dto: UpdateHackathonJudgeDto,
  ) {
    return this.judges.updateJudge(user.id, eventId, judgeId, dto);
  }

  @Delete('events/:eventId/hackathon/judges/:judgeId')
  removeJudge(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('judgeId', ParseUUIDPipe) judgeId: string,
  ) {
    return this.judges.removeJudge(user.id, eventId, judgeId);
  }

  @Get('events/:eventId/hackathon/panels')
  listPanels(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.judges.listPanels(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/panels')
  createPanel(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateHackathonPanelDto,
  ) {
    return this.judges.createPanel(user.id, eventId, dto);
  }

  @Patch('events/:eventId/hackathon/panels/:panelId')
  updatePanel(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('panelId', ParseUUIDPipe) panelId: string,
    @Body() dto: UpdateHackathonPanelDto,
  ) {
    return this.judges.updatePanel(user.id, eventId, panelId, dto);
  }

  @Delete('events/:eventId/hackathon/panels/:panelId')
  deletePanel(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('panelId', ParseUUIDPipe) panelId: string,
  ) {
    return this.judges.deletePanel(user.id, eventId, panelId);
  }

  // ── Curator: live queues ──────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/queues')
  @ApiOperation({ summary: 'Every judge and panel: current slot and who is waiting; recent marks with lock state' })
  queues(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.queue.getQueues(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/queue/:requestId/remove')
  removeFromQueue(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.queue.removeRequest(user.id, eventId, requestId);
  }

  @Post('events/:eventId/hackathon/queue/:requestId/reassign')
  @ApiOperation({ summary: 'Move a team that has not started to another judge or panel' })
  reassign(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: PickEvaluatorDto,
  ) {
    return this.queue.reassignRequest(user.id, eventId, requestId, dto);
  }

  @Post('events/:eventId/hackathon/queue/:requestId/force-complete')
  forceComplete(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ForceCompleteDto,
  ) {
    return this.queue.forceComplete(user.id, eventId, requestId, dto);
  }

  @Post('events/:eventId/hackathon/judgments/:judgmentId/reopen')
  @ApiOperation({ summary: 'Give a judge 5 more minutes on marks they submitted' })
  reopenJudgment(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('judgmentId', ParseUUIDPipe) judgmentId: string,
  ) {
    return this.queue.reopenJudgment(user.id, eventId, judgmentId);
  }

  // ── Judge ─────────────────────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/judge/console')
  @ApiOperation({ summary: 'Judge console: availability, current slot, queues, recent marks' })
  judgeConsole(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.queue.getConsole(user.id, eventId);
  }

  @Patch('events/:eventId/hackathon/judge/availability')
  judgeAvailability(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: JudgeAvailabilityDto,
  ) {
    return this.queue.setAvailability(user.id, eventId, dto.isAvailable);
  }

  @Post('events/:eventId/hackathon/judge/call-next')
  callNext(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CallNextDto,
  ) {
    return this.queue.callNext(user.id, eventId, dto);
  }

  @Post('events/:eventId/hackathon/judge/requests/:requestId/start')
  startSlot(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.queue.start(user.id, eventId, requestId);
  }

  @Post('events/:eventId/hackathon/judge/requests/:requestId/no-show')
  noShow(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.queue.noShow(user.id, eventId, requestId);
  }

  // ── Team member: evaluation queue ────────────────────────────────────────

  @Get('hackathon/:eventId/evaluate')
  @ApiOperation({ summary: 'My team: rounds, my queue place, recent evaluations. Never includes marks.' })
  myEvaluation(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.queue.getMyEvaluation(user.id, eventId);
  }

  @Get('hackathon/:eventId/rounds/:roundId/evaluators')
  @ApiOperation({ summary: 'Judges or panels my team can pick in a round' })
  evaluators(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ) {
    return this.queue.getEvaluators(user.id, eventId, roundId);
  }

  @Post('hackathon/:eventId/rounds/:roundId/requests')
  @ApiOperation({ summary: 'Join a judge or panel queue' })
  requestEvaluation(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: PickEvaluatorDto,
  ) {
    return this.queue.requestEvaluation(user.id, eventId, roundId, dto);
  }

  @Delete('hackathon/:eventId/requests/:requestId')
  @ApiOperation({ summary: 'Leave the queue' })
  withdraw(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.queue.withdraw(user.id, eventId, requestId);
  }
}
