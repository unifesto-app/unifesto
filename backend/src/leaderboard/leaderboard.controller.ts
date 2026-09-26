import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { LeaderboardService } from './leaderboard.service';
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

@ApiTags('Leaderboard')
@Controller()
export class LeaderboardController {
  constructor(
    private readonly leaderboard: LeaderboardService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Public board read. Optional auth: a PUBLIC board is returned to anyone; a
   * PARTICIPANTS_ONLY board needs a token belonging to a registered attendee
   * (or a manager/panelist). We resolve the user opportunistically from the
   * bearer token if one is present, but never require it.
   */
  @Get('leaderboards/:eventId/public')
  @ApiOperation({ summary: 'Public leaderboard snapshot (visibility-gated)' })
  async publicBoard(
    @Param('eventId') eventId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.optionalUserId(authHeader);
    return this.leaderboard.getPublicIfAllowed(eventId, userId);
  }

  private async optionalUserId(authHeader?: string): Promise<string | null> {
    if (!authHeader?.startsWith('Bearer ')) return null;
    try {
      const user = await this.authService.validateAccessToken(authHeader.slice(7));
      return user?.id ?? null;
    } catch {
      return null;
    }
  }

  // ── Participant view (never exposes marks) ────────────────────────────────

  @Get('leaderboards/:eventId/participant')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Participant view: own round status, bracket, winners, own feedback' })
  participantView(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.getParticipantView(eventId, req.user.id);
  }

  // ── Manager: board lifecycle ──────────────────────────────────────────────

  @Post('events/:eventId/leaderboard')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create the event’s leaderboard' })
  create(@Request() req, @Param('eventId') eventId: string, @Body() dto: CreateLeaderboardDto) {
    return this.leaderboard.createForEvent(req.user.id, eventId, dto);
  }

  @Patch('events/:eventId/leaderboard')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update config / visibility / status / enabled / revealReviews' })
  update(@Request() req, @Param('eventId') eventId: string, @Body() dto: UpdateLeaderboardDto) {
    return this.leaderboard.updateForEvent(req.user.id, eventId, dto);
  }

  @Get('events/:eventId/leaderboard/manage')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Full curator view (rounds, metrics, entrants, panels, awards)' })
  manageView(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.getManageView(req.user.id, eventId);
  }

  // ── Manager: rounds ───────────────────────────────────────────────────────

  @Get('events/:eventId/leaderboard/rounds')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  listRounds(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.listRounds(req.user.id, eventId);
  }

  @Post('events/:eventId/leaderboard/rounds')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  createRound(@Request() req, @Param('eventId') eventId: string, @Body() dto: CreateRoundDto) {
    return this.leaderboard.createRound(req.user.id, eventId, dto);
  }

  @Post('events/:eventId/leaderboard/rounds/reorder')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  reorderRounds(@Request() req, @Param('eventId') eventId: string, @Body() dto: ReorderRoundsDto) {
    return this.leaderboard.reorderRounds(req.user.id, eventId, dto);
  }

  @Patch('events/:eventId/leaderboard/rounds/:roundId/status')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Open / close / pause a round (drives the panelist read-lock)' })
  setRoundStatus(
    @Request() req,
    @Param('eventId') eventId: string,
    @Param('roundId') roundId: string,
    @Body() dto: SetRoundStatusDto,
  ) {
    return this.leaderboard.setRoundStatus(req.user.id, eventId, roundId, dto);
  }

  @Patch('events/:eventId/leaderboard/rounds/:roundId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  updateRound(
    @Request() req,
    @Param('eventId') eventId: string,
    @Param('roundId') roundId: string,
    @Body() dto: UpdateRoundDto,
  ) {
    return this.leaderboard.updateRound(req.user.id, eventId, roundId, dto);
  }

  @Delete('events/:eventId/leaderboard/rounds/:roundId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  deleteRound(@Request() req, @Param('eventId') eventId: string, @Param('roundId') roundId: string) {
    return this.leaderboard.deleteRound(req.user.id, eventId, roundId);
  }

  // ── Manager: metrics ──────────────────────────────────────────────────────

  @Put('events/:eventId/leaderboard/metrics')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create or update a metric/criterion (by key)' })
  upsertMetric(@Request() req, @Param('eventId') eventId: string, @Body() dto: UpsertMetricDto) {
    return this.leaderboard.upsertMetric(req.user.id, eventId, dto);
  }

  @Delete('events/:eventId/leaderboard/metrics/:metricId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  deleteMetric(@Request() req, @Param('eventId') eventId: string, @Param('metricId') metricId: string) {
    return this.leaderboard.deleteMetric(req.user.id, eventId, metricId);
  }

  // ── Manager: entrants ─────────────────────────────────────────────────────

  @Post('events/:eventId/leaderboard/entrants')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  createEntrant(@Request() req, @Param('eventId') eventId: string, @Body() dto: CreateEntrantDto) {
    return this.leaderboard.createEntrant(req.user.id, eventId, dto);
  }

  @Get('events/:eventId/leaderboard/registrants')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Search confirmed registrations to link an entrant to' })
  searchRegistrants(@Request() req, @Param('eventId') eventId: string, @Query('q') q?: string) {
    return this.leaderboard.searchRegistrants(req.user.id, eventId, q ?? '');
  }

  @Patch('events/:eventId/leaderboard/entrants/:entrantId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  updateEntrant(
    @Request() req,
    @Param('eventId') eventId: string,
    @Param('entrantId') entrantId: string,
    @Body() dto: UpdateEntrantDto,
  ) {
    return this.leaderboard.updateEntrant(req.user.id, eventId, entrantId, dto);
  }

  @Delete('events/:eventId/leaderboard/entrants/:entrantId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  deleteEntrant(@Request() req, @Param('eventId') eventId: string, @Param('entrantId') entrantId: string) {
    return this.leaderboard.deleteEntrant(req.user.id, eventId, entrantId);
  }

  // ── Manager: manual advancement / elimination ─────────────────────────────

  @Put('events/:eventId/leaderboard/entrants/:entrantId/round-status')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Advance / eliminate an entrant in a round (source of truth for the bracket)' })
  setEntrantRoundStatus(
    @Request() req,
    @Param('eventId') eventId: string,
    @Param('entrantId') entrantId: string,
    @Body() dto: SetEntrantRoundStatusDto,
  ) {
    return this.leaderboard.setEntrantRoundStatus(req.user.id, eventId, entrantId, dto);
  }

  // ── Manager: panelists (judges / mentors) ─────────────────────────────────

  @Get('events/:eventId/leaderboard/panelists')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  listPanelists(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.listPanelists(req.user.id, eventId);
  }

  @Post('events/:eventId/leaderboard/panelists')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Assign a judge/mentor (by userId or invite-by-email)' })
  assignPanelist(@Request() req, @Param('eventId') eventId: string, @Body() dto: AssignPanelistDto) {
    return this.leaderboard.assignPanelist(req.user.id, eventId, dto);
  }

  @Delete('events/:eventId/leaderboard/panelists/:panelistId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  removePanelist(@Request() req, @Param('eventId') eventId: string, @Param('panelistId') panelistId: string) {
    return this.leaderboard.removePanelist(req.user.id, eventId, panelistId);
  }

  // ── Manager: awards ───────────────────────────────────────────────────────

  @Get('events/:eventId/leaderboard/awards')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  listAwards(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.listAwards(req.user.id, eventId);
  }

  @Post('events/:eventId/leaderboard/awards')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  createAward(@Request() req, @Param('eventId') eventId: string, @Body() dto: CreateAwardDto) {
    return this.leaderboard.createAward(req.user.id, eventId, dto);
  }

  @Patch('events/:eventId/leaderboard/awards/:awardId/publish')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Publish / unpublish a named award' })
  setAwardPublished(
    @Request() req,
    @Param('eventId') eventId: string,
    @Param('awardId') awardId: string,
    @Body() dto: SetAwardPublishedDto,
  ) {
    return this.leaderboard.setAwardPublished(req.user.id, eventId, awardId, dto);
  }

  @Patch('events/:eventId/leaderboard/awards/:awardId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  updateAward(
    @Request() req,
    @Param('eventId') eventId: string,
    @Param('awardId') awardId: string,
    @Body() dto: UpdateAwardDto,
  ) {
    return this.leaderboard.updateAward(req.user.id, eventId, awardId, dto);
  }

  @Delete('events/:eventId/leaderboard/awards/:awardId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  deleteAward(@Request() req, @Param('eventId') eventId: string, @Param('awardId') awardId: string) {
    return this.leaderboard.deleteAward(req.user.id, eventId, awardId);
  }

  // ── Panelist: my assignments + my own scores/review ───────────────────────

  @Get('leaderboard/my-judging-events')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Events where the signed-in user is a judge/mentor (mobile Judging list)' })
  myJudgingEvents(@Request() req) {
    return this.leaderboard.getMyJudgingEvents(req.user.id);
  }

  @Get('events/:eventId/leaderboard/my-assignments')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'The signed-in judge/mentor’s rounds + entrants in scope' })
  myAssignments(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.getMyAssignments(req.user.id, eventId);
  }

  @Get('leaderboard/entrants/:entrantId/judgment/:roundId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'My own cells + review for an entrant/round (read-locked when closed)' })
  myJudgment(
    @Request() req,
    @Param('entrantId') entrantId: string,
    @Param('roundId') roundId: string,
  ) {
    return this.leaderboard.getMyJudgment(req.user.id, entrantId, roundId);
  }

  @Post('leaderboard/entrants/:entrantId/judgment')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'RUBRIC panelist submit: scores (judge) + review, scoped + round-gated' })
  submitJudgment(@Request() req, @Param('entrantId') entrantId: string, @Body() dto: SubmitJudgmentDto) {
    return this.leaderboard.submitJudgment(req.user.id, entrantId, dto);
  }

  // ── Scoring — METRIC organiser entry ──────────────────────────────────────

  @Post('leaderboard/entrants/:entrantId/scores')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'METRIC organiser entry: authoritative values for a round' })
  submitScores(@Request() req, @Param('entrantId') entrantId: string, @Body() dto: SubmitScoresDto) {
    return this.leaderboard.submitScores(req.user.id, entrantId, dto);
  }

  // ── Manager: judges (legacy, kept until the hack app is removed) ───────────

  @Get('events/:eventId/leaderboard/judges')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  listJudges(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.listJudges(req.user.id, eventId);
  }

  @Post('events/:eventId/leaderboard/judges')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  assignJudge(@Request() req, @Param('eventId') eventId: string, @Body() dto: AssignJudgeDto) {
    return this.leaderboard.assignJudge(req.user.id, eventId, dto);
  }

  @Delete('events/:eventId/leaderboard/judges/:judgeUserId')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  removeJudge(@Request() req, @Param('eventId') eventId: string, @Param('judgeUserId') judgeUserId: string) {
    return this.leaderboard.removeJudge(req.user.id, eventId, judgeUserId);
  }
}
