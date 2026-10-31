import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';
import { SubmitJudgmentDto } from './dto';

/**
 * What is left of the legacy competitive-dashboard API (hack.unifesto.app is
 * retired). Only routes a current client calls: mobile's participant view and the
 * panelist judging routes.
 * Hackathon routes live in hackathon.controller.ts.
 */
@Controller()
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  // ── Participant view (never exposes marks) ────────────────────────────────

  @Get('leaderboards/:eventId/participant')
  @UseGuards(JwtAuthGuard)
  participantView(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.getParticipantView(eventId, req.user.id);
  }

  // ── Panelist: my assignments + my own scores/review ───────────────────────

  @Get('leaderboard/my-judging-events')
  @UseGuards(JwtAuthGuard)
  myJudgingEvents(@Request() req) {
    return this.leaderboard.getMyJudgingEvents(req.user.id);
  }

  @Get('events/:eventId/leaderboard/my-assignments')
  @UseGuards(JwtAuthGuard)
  myAssignments(@Request() req, @Param('eventId') eventId: string) {
    return this.leaderboard.getMyAssignments(req.user.id, eventId);
  }

  @Get('leaderboard/entrants/:entrantId/judgment/:roundId')
  @UseGuards(JwtAuthGuard)
  myJudgment(
    @Request() req,
    @Param('entrantId') entrantId: string,
    @Param('roundId') roundId: string,
  ) {
    return this.leaderboard.getMyJudgment(req.user.id, entrantId, roundId);
  }

  @Post('leaderboard/entrants/:entrantId/judgment')
  @UseGuards(JwtAuthGuard)
  submitJudgment(@Request() req, @Param('entrantId') entrantId: string, @Body() dto: SubmitJudgmentDto) {
    return this.leaderboard.submitJudgment(req.user.id, entrantId, dto);
  }
}
