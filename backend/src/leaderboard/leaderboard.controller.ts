import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';
import { SubmitJudgmentDto } from './dto';

/**
 * What is left of the legacy competitive-dashboard API (hack.unifesto.app is
 * retired). Only routes a current client calls: Apex reads `manage` for board
 * status; mobile uses the participant view and the panelist judging routes.
 * Hackathon routes live in hackathon.controller.ts.
 */
@ApiTags('Leaderboard')
@Controller()
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  // ── Participant view (never exposes marks) ────────────────────────────────

  @Get('leaderboards/:eventId/participant')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Participant view: own round status, bracket, winners, own feedback' })
  participantView(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.getParticipantView(eventId, req.user.id);
  }

  // ── Manager ───────────────────────────────────────────────────────────────

  @Get('events/:eventId/leaderboard/manage')
  @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Full curator view (rounds, metrics, entrants, panels, awards)' })
  manageView(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.getManageView(req.user.id, eventId);
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
}
