import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Req,
  Headers,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SessionsService } from './sessions.service';
import {
  CreateSessionDto,
  UpdateSessionDto,
  CancelSessionDto,
  AddRecordingDto,
  AddCoHostDto,
  VerifySessionPaymentDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Sessions')
@Controller()
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // --- Public discovery -----------------------------------------------------

  @Get('sessions')
  @ApiOperation({ summary: 'List published, public, upcoming sessions (optionally one space\'s)' })
  async list(@Query('spaceId', new ParseUUIDPipe({ optional: true })) spaceId?: string) {
    return this.sessionsService.listPublicSessions(spaceId);
  }

  @Get('sessions/:slug')
  @ApiOperation({ summary: 'Public session detail (no meeting link)' })
  async getBySlug(@Param('slug') slug: string) {
    return this.sessionsService.getPublicSession(slug);
  }

  // --- Attendee -------------------------------------------------------------

  @Get('me/sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "The caller's session registrations" })
  async myRegistrations(@Request() req) {
    return this.sessionsService.listMyRegistrations(req.user.id);
  }

  @Post('sessions/:id/register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Register (free completes; paid returns an order)' })
  @ApiResponse({ status: 201 })
  async register(@Request() req, @Param('id') id: string) {
    return this.sessionsService.register(req.user.id, id);
  }

  @Post('sessions/register/verify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify Razorpay payment for a session' })
  async verify(@Request() req, @Body() dto: VerifySessionPaymentDto) {
    return this.sessionsService.verifyPayment(req.user.id, dto);
  }

  @Post('sessions/:id/join')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get the meeting link (registered users, inside join window)',
  })
  async join(@Request() req, @Param('id') id: string) {
    return this.sessionsService.join(req.user.id, id);
  }

  // --- Organiser (space-scoped) --------------------------------------------

  @Get('spaces/:spaceId/sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: list a space’s sessions' })
  async listForSpace(
    @Request() req,
    @Param('spaceId') spaceId: string,
    @Query('deleted') deleted?: string,
  ) {
    return this.sessionsService.listSpaceSessions(
      req.user.id,
      spaceId,
      // Anything other than the two explicit opt-ins means the normal list.
      deleted === 'deleted' || deleted === 'all' ? deleted : 'active',
    );
  }

  @Post('spaces/:spaceId/sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: create a session' })
  @ApiResponse({ status: 201 })
  async create(
    @Request() req,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionsService.createSession(req.user.id, spaceId, dto);
  }

  @Patch('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: edit a session' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.updateSession(req.user.id, id, dto);
  }

  @Post('sessions/:id/publish')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: publish a draft session' })
  async publish(@Request() req, @Param('id') id: string) {
    return this.sessionsService.publishSession(req.user.id, id);
  }

  @Post('sessions/:id/complete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Organiser: end a live session now (stops recording, closes room)',
  })
  async complete(@Request() req, @Param('id') id: string) {
    return this.sessionsService.completeSession(req.user.id, id);
  }

  @Delete('sessions/:id/hide')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Organiser: hide a completed or cancelled session. Reversible — nothing is destroyed',
  })
  async softDelete(@Request() req, @Param('id') id: string) {
    return this.sessionsService.softDeleteSession(req.user.id, id);
  }

  @Patch('sessions/:id/restore')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: bring a hidden session back' })
  async restore(@Request() req, @Param('id') id: string) {
    return this.sessionsService.restoreSession(req.user.id, id);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Organiser: permanently delete a draft or cancelled session. ' +
      'Irreversible, and never allowed for a completed session',
  })
  async remove(@Request() req, @Param('id') id: string) {
    return this.sessionsService.permanentDeleteSession(req.user.id, id);
  }

  @Post('sessions/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Organiser: cancel a session (auto-refunds payers)',
  })
  async cancel(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CancelSessionDto,
  ) {
    return this.sessionsService.cancelSession(req.user.id, id, dto.reason);
  }

  @Post('sessions/:id/duplicate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: duplicate a session as a new draft' })
  async duplicate(@Request() req, @Param('id') id: string) {
    return this.sessionsService.duplicateSession(req.user.id, id);
  }

  @Post('sessions/:id/recording')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: attach a recording URL' })
  async recording(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AddRecordingDto,
  ) {
    return this.sessionsService.addRecording(req.user.id, id, dto.recordingUrl);
  }

  @Get('sessions/:id/attendees')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: session attendee list' })
  async attendees(@Request() req, @Param('id') id: string) {
    return this.sessionsService.listAttendees(req.user.id, id);
  }

  @Get('sessions/:id/cohosts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: list a session’s co-hosts' })
  async listCoHosts(@Request() req, @Param('id') id: string) {
    return this.sessionsService.listCoHosts(req.user.id, id);
  }

  @Post('sessions/:id/cohosts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: add a co-host by email' })
  async addCoHost(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AddCoHostDto,
  ) {
    return this.sessionsService.addCoHost(req.user.id, id, dto.email);
  }

  @Delete('sessions/:id/cohosts/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: remove a co-host' })
  async removeCoHost(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.sessionsService.removeCoHost(req.user.id, id, userId);
  }

  @Post('sessions/:id/recording/start')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: start recording a live session' })
  async startRecording(@Request() req, @Param('id') id: string) {
    return this.sessionsService.startRecording(req.user.id, id);
  }

  @Post('sessions/:id/recording/stop')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Organiser: stop recording a live session' })
  async stopRecording(@Request() req, @Param('id') id: string) {
    return this.sessionsService.stopRecording(req.user.id, id);
  }

  // --- LiveKit webhook (server-to-server, signed) --------------------------

  @Post('livekit/webhook')
  @HttpCode(200)
  @SkipThrottle()
  @ApiOperation({ summary: 'LiveKit webhook (signature-validated)' })
  async livekitWebhook(
    @Req() req: { rawBody?: Buffer },
    @Headers('authorization') authHeader: string,
  ) {
    // Validate the signature against the raw body, then act on the event.
    const body = req.rawBody?.toString('utf8') ?? '';
    const event = await this.sessionsService.verifyAndHandleWebhook(
      body,
      authHeader,
    );
    return { received: event };
  }
}
