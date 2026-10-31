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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller()
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // --- Public discovery -----------------------------------------------------

  @Get('sessions')
  async list(@Query('spaceId', new ParseUUIDPipe({ optional: true })) spaceId?: string) {
    return this.sessionsService.listPublicSessions(spaceId);
  }

  @Get('sessions/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  async getBySlug(@Request() req, @Param('slug') slug: string) {
    return this.sessionsService.getPublicSession(slug, req.user?.id);
  }

  // --- Attendee -------------------------------------------------------------

  @Get('me/sessions')
  @UseGuards(JwtAuthGuard)
  async myRegistrations(@Request() req) {
    return this.sessionsService.listMyRegistrations(req.user.id);
  }

  @Post('sessions/:id/register')
  @UseGuards(JwtAuthGuard)
  async register(@Request() req, @Param('id') id: string) {
    return this.sessionsService.register(req.user.id, id);
  }

  @Post('sessions/register/verify')
  @UseGuards(JwtAuthGuard)
  async verify(@Request() req, @Body() dto: VerifySessionPaymentDto) {
    return this.sessionsService.verifyPayment(req.user.id, dto);
  }

  @Post('sessions/:id/join')
  @UseGuards(JwtAuthGuard)
  async join(@Request() req, @Param('id') id: string) {
    return this.sessionsService.join(req.user.id, id);
  }

  // --- Organiser (space-scoped) --------------------------------------------

  @Get('spaces/:spaceId/sessions')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async create(
    @Request() req,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionsService.createSession(req.user.id, spaceId, dto);
  }

  @Patch('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.updateSession(req.user.id, id, dto);
  }

  @Post('sessions/:id/publish')
  @UseGuards(JwtAuthGuard)
  async publish(@Request() req, @Param('id') id: string) {
    return this.sessionsService.publishSession(req.user.id, id);
  }

  @Post('sessions/:id/complete')
  @UseGuards(JwtAuthGuard)
  async complete(@Request() req, @Param('id') id: string) {
    return this.sessionsService.completeSession(req.user.id, id);
  }

  @Delete('sessions/:id/hide')
  @UseGuards(JwtAuthGuard)
  async softDelete(@Request() req, @Param('id') id: string) {
    return this.sessionsService.softDeleteSession(req.user.id, id);
  }

  @Patch('sessions/:id/restore')
  @UseGuards(JwtAuthGuard)
  async restore(@Request() req, @Param('id') id: string) {
    return this.sessionsService.restoreSession(req.user.id, id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async remove(@Request() req, @Param('id') id: string) {
    return this.sessionsService.permanentDeleteSession(req.user.id, id);
  }

  @Post('sessions/:id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CancelSessionDto,
  ) {
    return this.sessionsService.cancelSession(req.user.id, id, dto.reason);
  }

  @Post('sessions/:id/duplicate')
  @UseGuards(JwtAuthGuard)
  async duplicate(@Request() req, @Param('id') id: string) {
    return this.sessionsService.duplicateSession(req.user.id, id);
  }

  @Post('sessions/:id/recording')
  @UseGuards(JwtAuthGuard)
  async recording(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AddRecordingDto,
  ) {
    return this.sessionsService.addRecording(req.user.id, id, dto.recordingUrl);
  }

  @Get('sessions/:id/attendees')
  @UseGuards(JwtAuthGuard)
  async attendees(@Request() req, @Param('id') id: string) {
    return this.sessionsService.listAttendees(req.user.id, id);
  }

  @Get('sessions/:id/cohosts')
  @UseGuards(JwtAuthGuard)
  async listCoHosts(@Request() req, @Param('id') id: string) {
    return this.sessionsService.listCoHosts(req.user.id, id);
  }

  @Post('sessions/:id/cohosts')
  @UseGuards(JwtAuthGuard)
  async addCoHost(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AddCoHostDto,
  ) {
    return this.sessionsService.addCoHost(req.user.id, id, dto.email);
  }

  @Delete('sessions/:id/cohosts/:userId')
  @UseGuards(JwtAuthGuard)
  async removeCoHost(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.sessionsService.removeCoHost(req.user.id, id, userId);
  }

  @Post('sessions/:id/recording/start')
  @UseGuards(JwtAuthGuard)
  async startRecording(@Request() req, @Param('id') id: string) {
    return this.sessionsService.startRecording(req.user.id, id);
  }

  @Post('sessions/:id/recording/stop')
  @UseGuards(JwtAuthGuard)
  async stopRecording(@Request() req, @Param('id') id: string) {
    return this.sessionsService.stopRecording(req.user.id, id);
  }

  // --- LiveKit webhook (server-to-server, signed) --------------------------

  @Post('livekit/webhook')
  @HttpCode(200)
  @SkipThrottle()
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
