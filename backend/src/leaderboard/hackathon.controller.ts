import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { HackathonSetupService } from './hackathon-setup.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonStatementsService } from './hackathon-statements.service';
import { HackathonJudgesService } from './hackathon-judges.service';
import { HackathonRoundsService } from './hackathon-rounds.service';
import { HackathonQueueService } from './hackathon-queue.service';
import { HackathonResultsService } from './hackathon-results.service';
import { HackathonSubmissionsService } from './hackathon-submissions.service';
import { HackathonAnnouncementsService } from './hackathon-announcements.service';
import { HackathonCertificatesService } from './hackathon-certificates.service';
import { HackathonHelpService } from './hackathon-help.service';
import {
  CreateHelpTopicDto,
  RaiseHelpQueryDto,
  SetHelpQueryStatusDto,
  UpdateHelpTopicDto,
  IssueHackathonCertificatesDto,
  SaveSubmissionDto,
  SendAnnouncementDto,
  CreateHackathonAwardDto,
  PublishAwardsDto,
  SetRoundDecisionsDto,
  UpdateHackathonAwardDto,
  AddHackathonJudgeDto,
  CallNextDto,
  CreateHackathonPanelDto,
  CreateHackathonRoundDto,
  JudgeAvailabilityDto,
  PickEvaluatorDto,
  SetHackathonRoundStatusDto,
  SetTeamRoundDecisionDto,
  UpdateHackathonJudgeDto,
  UpdateHackathonPanelDto,
  UpdateHackathonRoundDto,
  UpsertCriterionDto,
  CreateHackathonRoomDto,
  CreateHackathonStatementDto,
  CreateHackathonThemeDto,
  SetTeamStatementDto,
  UpdateHackathonStatementDto,
  UpdateHackathonThemeDto,
  ImportHackathonTeamsDto,
  RenameMyTeamDto,
  UpdateHackathonConfigDto,
  UpdateHackathonRoomDto,
  UpdateHackathonTeamDto,
} from './dto/hackathon.dto';

/**
 * Hackathon mode (docs/hackathon-mobile-plan.md). Curator routes live under
 * `events/:eventId/hackathon` and are gated by `event:manage-leaderboard` in
 * the services; team routes live under `hackathon/:eventId` and are gated by
 * team membership.
 */
@ApiTags('Hackathon')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class HackathonController {
  constructor(
    private readonly setup: HackathonSetupService,
    private readonly teams: HackathonTeamsService,
    private readonly statements: HackathonStatementsService,
    private readonly judges: HackathonJudgesService,
    private readonly rounds: HackathonRoundsService,
    private readonly queue: HackathonQueueService,
    private readonly results: HackathonResultsService,
    private readonly submissions: HackathonSubmissionsService,
    private readonly announcements: HackathonAnnouncementsService,
    private readonly hackathonCertificates: HackathonCertificatesService,
    private readonly help: HackathonHelpService,
  ) {}

  // ── Curator: mode + settings ──────────────────────────────────────────────

  @Get('events/:eventId/hackathon')
  @ApiOperation({ summary: 'Curator dashboard: on/off, settings, counts' })
  overview(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.getOverview(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/enable')
  @ApiOperation({ summary: 'Switch hackathon mode on (creates the board if needed)' })
  enable(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.enable(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/disable')
  @ApiOperation({ summary: 'Switch hackathon mode off (data kept)' })
  disable(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.disable(user.id, eventId);
  }

  @Patch('events/:eventId/hackathon/config')
  @ApiOperation({ summary: 'Team ID pattern, team-name question, venue, problem-statement mode + deadline' })
  updateConfig(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateHackathonConfigDto,
  ) {
    return this.setup.updateConfig(user.id, eventId, dto);
  }

  // ── Curator: teams ────────────────────────────────────────────────────────

  @Post('events/:eventId/hackathon/teams/import')
  @ApiOperation({ summary: 'Import attending GROUP registrations as teams (re-runnable)' })
  importTeams(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ImportHackathonTeamsDto,
  ) {
    return this.teams.importTeams(user.id, eventId, dto);
  }

  @Get('events/:eventId/hackathon/teams')
  listTeams(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.teams.listTeams(user.id, eventId);
  }

  @Get('events/:eventId/hackathon/teams/:entrantId')
  getTeam(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
  ) {
    return this.teams.getTeam(user.id, eventId, entrantId);
  }

  @Patch('events/:eventId/hackathon/teams/:entrantId')
  @ApiOperation({ summary: 'Edit a team’s ID, name or room' })
  updateTeam(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
    @Body() dto: UpdateHackathonTeamDto,
  ) {
    return this.teams.updateTeam(user.id, eventId, entrantId, dto);
  }

  @Put('events/:eventId/hackathon/teams/:entrantId/statement')
  @ApiOperation({ summary: 'Assign or change a team’s problem statement + theme (locks it)' })
  assignStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
    @Body() dto: SetTeamStatementDto,
  ) {
    return this.statements.assignStatement(user.id, eventId, entrantId, dto);
  }

  @Post('events/:eventId/hackathon/teams/:entrantId/statement/unlock')
  @ApiOperation({ summary: 'Reopen a team’s problem statement so it can choose again' })
  unlockStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
  ) {
    return this.statements.unlockStatement(user.id, eventId, entrantId);
  }

  // ── Curator: themes ───────────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/themes')
  listThemes(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.statements.listThemes(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/themes')
  createTheme(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateHackathonThemeDto,
  ) {
    return this.statements.createTheme(user.id, eventId, dto);
  }

  @Patch('events/:eventId/hackathon/themes/:themeId')
  updateTheme(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('themeId', ParseUUIDPipe) themeId: string,
    @Body() dto: UpdateHackathonThemeDto,
  ) {
    return this.statements.updateTheme(user.id, eventId, themeId, dto);
  }

  @Delete('events/:eventId/hackathon/themes/:themeId')
  deleteTheme(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('themeId', ParseUUIDPipe) themeId: string,
  ) {
    return this.statements.deleteTheme(user.id, eventId, themeId);
  }

  // ── Curator: problem statements ───────────────────────────────────────────

  @Get('events/:eventId/hackathon/statements')
  @ApiOperation({ summary: 'Problem statements with the teams on each' })
  listStatements(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.statements.listStatements(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/statements')
  createStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateHackathonStatementDto,
  ) {
    return this.statements.createStatement(user.id, eventId, dto);
  }

  @Patch('events/:eventId/hackathon/statements/:statementId')
  updateStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @Body() dto: UpdateHackathonStatementDto,
  ) {
    return this.statements.updateStatement(user.id, eventId, statementId, dto);
  }

  @Delete('events/:eventId/hackathon/statements/:statementId')
  deleteStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
  ) {
    return this.statements.deleteStatement(user.id, eventId, statementId);
  }

  // ── Curator: rooms ────────────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/rooms')
  listRooms(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.listRooms(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/rooms')
  createRoom(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateHackathonRoomDto,
  ) {
    return this.setup.createRoom(user.id, eventId, dto);
  }

  @Post('events/:eventId/hackathon/rooms/auto-allocate')
  @ApiOperation({ summary: 'Fill free room places with teams that have no room' })
  autoAllocate(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.autoAllocate(user.id, eventId);
  }

  @Patch('events/:eventId/hackathon/rooms/:roomId')
  updateRoom(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: UpdateHackathonRoomDto,
  ) {
    return this.setup.updateRoom(user.id, eventId, roomId, dto);
  }

  @Delete('events/:eventId/hackathon/rooms/:roomId')
  deleteRoom(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.setup.deleteRoom(user.id, eventId, roomId);
  }

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

  // ── Curator: results & winners ────────────────────────────────────────────

  @Get('events/:eventId/hackathon/results')
  @ApiOperation({ summary: 'Marks matrix and ranking per round and overall; PS-changed flags; awards' })
  getResults(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.results.getResults(user.id, eventId);
  }

  @Get('events/:eventId/hackathon/results.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'The results as one CSV' })
  async resultsCsv(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return (await this.results.resultsCsv(user.id, eventId)).csv;
  }

  @Get('events/:eventId/hackathon/awards')
  listAwards(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.results.listAwards(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/awards')
  @ApiOperation({ summary: 'Declare an award for a team (Curator / Space Admin)' })
  createAward(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: CreateHackathonAwardDto) {
    return this.results.createAward(user.id, eventId, dto);
  }

  @Post('events/:eventId/hackathon/awards/publish')
  @ApiOperation({ summary: 'Publish awards; winners and everyone else are told' })
  publishAwards(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: PublishAwardsDto) {
    return this.results.publishAwards(user.id, eventId, dto);
  }

  @Patch('events/:eventId/hackathon/awards/:awardId')
  updateAward(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('awardId', ParseUUIDPipe) awardId: string,
    @Body() dto: UpdateHackathonAwardDto,
  ) {
    return this.results.updateAward(user.id, eventId, awardId, dto);
  }

  @Post('events/:eventId/hackathon/awards/:awardId/unpublish')
  unpublishAward(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('awardId', ParseUUIDPipe) awardId: string,
  ) {
    return this.results.unpublishAward(user.id, eventId, awardId);
  }

  @Delete('events/:eventId/hackathon/awards/:awardId')
  deleteAward(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('awardId', ParseUUIDPipe) awardId: string,
  ) {
    return this.results.deleteAward(user.id, eventId, awardId);
  }

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
  ) {
    return this.queue.forceComplete(user.id, eventId, requestId);
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

  // ── Curator: announcements ────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/announcements')
  @ApiOperation({ summary: 'Sent announcements, newest first, and the rooms you can send to' })
  listAnnouncements(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.announcements.list(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/announcements')
  @ApiOperation({ summary: 'Send an announcement (push + in-app) to all, teams, judges or one room' })
  sendAnnouncement(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: SendAnnouncementDto) {
    return this.announcements.send(user.id, eventId, dto);
  }

  // ── Curator: help topics ──────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/help/topics')
  @ApiOperation({ summary: 'Help topics with their POCs, and the event team to pick from' })
  helpTopics(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.help.listTopics(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/help/topics')
  createHelpTopic(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: CreateHelpTopicDto) {
    return this.help.createTopic(user.id, eventId, dto);
  }

  @Patch('events/:eventId/hackathon/help/topics/:topicId')
  updateHelpTopic(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() dto: UpdateHelpTopicDto,
  ) {
    return this.help.updateTopic(user.id, eventId, topicId, dto);
  }

  @Delete('events/:eventId/hackathon/help/topics/:topicId')
  deleteHelpTopic(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
  ) {
    return this.help.deleteTopic(user.id, eventId, topicId);
  }

  // ── Curator: certificates ─────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/certificates')
  @ApiOperation({ summary: 'Templates, who would get certificates, and past batches' })
  certificates(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.hackathonCertificates.getOverview(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/certificates/issue')
  @ApiOperation({ summary: 'Issue participant or winner certificates from a template (Curator / Space Admin)' })
  issueCertificates(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: IssueHackathonCertificatesDto) {
    return this.hackathonCertificates.issue(user.id, eventId, dto);
  }

  @Get('events/:eventId/hackathon/certificates/batches/:batchId')
  certificateBatch(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.hackathonCertificates.batch(user.id, eventId, batchId);
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

  // ── Team member ───────────────────────────────────────────────────────────

  @Get('hackathon/:eventId/me')
  @ApiOperation({ summary: 'My team hub (null when the event runs no hackathon). Never includes marks.' })
  myHub(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.teams.getMyHub(user.id, eventId);
  }

  @Patch('hackathon/:eventId/me/team-name')
  @ApiOperation({ summary: 'Team lead renames the team' })
  renameMyTeam(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: RenameMyTeamDto,
  ) {
    return this.teams.renameMyTeam(user.id, eventId, dto.name);
  }

  @Get('hackathon/:eventId/help')
  @ApiOperation({ summary: 'Help topics, my room’s volunteers, and my team’s queries' })
  myHelp(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.help.getMyHelp(user.id, eventId);
  }

  @Post('hackathon/:eventId/help/queries')
  @ApiOperation({ summary: 'Raise a query; it goes to the topic’s POCs and my room’s volunteers' })
  raiseHelpQuery(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: RaiseHelpQueryDto) {
    return this.help.raise(user.id, eventId, dto);
  }

  // ── Event team: help desk inbox ───────────────────────────────────────────

  @Get('hackathon/:eventId/help/inbox')
  @ApiOperation({ summary: 'Queries sent to me (every query for curators); null when there is no hackathon' })
  helpInbox(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.help.inbox(user.id, eventId);
  }

  @Post('hackathon/:eventId/help/queries/:queryId/status')
  @ApiOperation({ summary: 'Pick a query up, resolve it, or reopen it' })
  setHelpQueryStatus(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('queryId', ParseUUIDPipe) queryId: string,
    @Body() dto: SetHelpQueryStatusDto,
  ) {
    return this.help.setStatus(user.id, eventId, queryId, dto.status);
  }

  @Get('hackathon/:eventId/statements')
  @ApiOperation({ summary: 'My team’s problem-statement choices: mode, deadline, themes, the list' })
  myStatementOptions(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.statements.getMyOptions(user.id, eventId);
  }

  @Post('hackathon/:eventId/me/statement')
  @ApiOperation({ summary: 'Team lead locks in the team’s problem statement + theme (final)' })
  lockMyStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SetTeamStatementDto,
  ) {
    return this.statements.lockMyStatement(user.id, eventId, dto);
  }

  @Get('hackathon/:eventId/submissions')
  @ApiOperation({ summary: 'My team’s project links per round, and which it can still change' })
  mySubmissions(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.submissions.getMine(user.id, eventId);
  }

  @Put('hackathon/:eventId/rounds/:roundId/submission')
  @ApiOperation({ summary: 'Save my team’s project links for a round' })
  saveSubmission(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: SaveSubmissionDto,
  ) {
    return this.submissions.saveMine(user.id, eventId, roundId, dto);
  }

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
