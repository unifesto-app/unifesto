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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HackathonResultsService } from './hackathon-results.service';
import { HackathonCertificatesService } from './hackathon-certificates.service';
import {
  IssueHackathonCertificatesDto,
  CreateHackathonAwardDto,
  PublishAwardsDto,
  UpdateHackathonAwardDto,
} from './dto/hackathon.dto';

/**
 * Hackathon mode, results side (E11): results, the CSV, awards and winners,
 * and certificates from awards.
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
export class HackathonResultsController {
  constructor(
    private readonly results: HackathonResultsService,
    private readonly hackathonCertificates: HackathonCertificatesService,
  ) {}

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
}
