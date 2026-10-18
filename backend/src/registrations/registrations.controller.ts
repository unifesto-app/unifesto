import {
  Logger,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Headers,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RegistrationsService } from './registrations.service';
import {
  RegisterForEventDto,
  VerifyRegistrationDto,
  CreateOrderDto,
  VerifyPaymentDto,
  UpdateGroupMembersDto,
  AllowNextFromWaitlistDto,
  TransferRegistrationDto,
  CreateTransferRequestDto,
  ReviewTransferRequestDto,
  ManualAddAttendeeDto,
  SetWhatsappJoinedDto,
  CancelMyRegistrationDto,
} from './dto';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { RoleCode } from '@prisma/client';
import { Can, CanGuard, Action } from '../auth/authorization';

@ApiTags('Registrations')
@Controller()
export class RegistrationsController {
  constructor(
    private readonly registrationsService: RegistrationsService,
    private readonly waitlistService: WaitlistService,
  ) {}

  @Post('events/:id/register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Register for an event (RSVP or buy tickets)' })
  @ApiResponse({ status: 201 })
  async registerForEvent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: RegisterForEventDto,
  ) {
    return this.registrationsService.registerForEvent(req.user.id, id, dto);
  }

  @Post('events/:id/register/create-order')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create Razorpay order for paid ticket registration' })
  @ApiResponse({ status: 201 })
  async createPaymentOrder(
    @Request() req,
    @Param('id') eventId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.registrationsService.createPaymentOrder(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Post('events/:id/register/verify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify Razorpay payment for registration' })
  @ApiResponse({ status: 200 })
  async verifyPayment(
    @Request() req,
    @Param('id') eventId: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.registrationsService.verifyPayment(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Get('events/:id/my-registration')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my registration for an event' })
  @ApiResponse({ status: 200 })
  async getMyRegistration(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getMyRegistration(req.user.id, id);
  }

  @Get('events/:id/my-registrations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all of my registrations for an event (one per ticket type)' })
  @ApiResponse({ status: 200 })
  async getMyRegistrationsForEvent(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getMyRegistrationsForEvent(req.user.id, id);
  }

  @Get('registrations/:id/checkins')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the check-in records for my registration (one per check-in point)' })
  @ApiResponse({ status: 200 })
  async getMyRegistrationCheckins(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getMyRegistrationCheckins(req.user.id, id);
  }

  @Get('registrations/:id/group-members')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my group registration roster (lead only)' })
  @ApiResponse({ status: 200 })
  async getMyGroupMembers(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getMyGroupMembers(req.user.id, id);
  }

  @Patch('registrations/:id/group-members')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Set / complete my group registration roster (lead only)' })
  @ApiResponse({ status: 200 })
  async updateMyGroupMembers(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateGroupMembersDto,
  ) {
    return this.registrationsService.updateMyGroupMembers(
      req.user.id,
      id,
      dto.groupMembers,
    );
  }

  @Get('registrations/:id/whatsapp-group')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "This ticket's WhatsApp group invite + my join state" })
  @ApiResponse({ status: 200 })
  async getRegistrationWhatsappGroup(
    @Request() req,
    @Param('id') id: string,
  ) {
    return this.registrationsService.getRegistrationWhatsappGroup(
      req.user.id,
      id,
    );
  }

  @Patch('registrations/:id/whatsapp-joined')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mark (or clear) that I joined this event\'s WhatsApp group' })
  @ApiResponse({ status: 200 })
  async setWhatsappJoined(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: SetWhatsappJoinedDto,
  ) {
    return this.registrationsService.setWhatsappGroupJoined(
      req.user.id,
      id,
      dto.joined,
    );
  }

  @Delete('events/:id/register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel my registration (optionally for a specific ticket type)' })
  @ApiResponse({ status: 200 })
  async cancelRegistration(
    @Request() req,
    @Param('id') id: string,
    @Query('ticketTypeId') ticketTypeId?: string,
    @Query('reason') reason?: string,
  ) {
    return this.registrationsService.cancelRegistration(id, req.user.id, ticketTypeId, reason);
  }

  @Get('events/:id/registrations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get event registrations (organiser only)' })
  @ApiResponse({ status: 200 })
  async getEventRegistrations(
    @Request() req,
    @Param('id') id: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('ticketTypeId') ticketTypeId?: string,
    @Query('attendingOnly') attendingOnly?: string,
  ) {
    return this.registrationsService.getEventRegistrations(
      req.user.id,
      id,
      +page,
      +limit,
      search,
      status as any,
      paymentStatus as any,
      ticketTypeId,
      attendingOnly === 'true',
    );
  }

  @Get('events/:id/registration-sources')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW)
  @ApiOperation({
    summary: 'Confirmed registrations grouped by utm source / medium / campaign',
  })
  @ApiResponse({ status: 200 })
  async getRegistrationSources(@Param('id') id: string) {
    return this.registrationsService.getRegistrationSources(id);
  }

  @Get('events/:id/registration-sources/attendees')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @ApiOperation({
    summary: 'Confirmed registrations from one utm source row (empty tag = untagged)',
  })
  @ApiResponse({ status: 200 })
  async getSourceAttendees(
    @Param('id') id: string,
    @Query('source') source?: string,
    @Query('medium') medium?: string,
    @Query('campaign') campaign?: string,
  ) {
    return this.registrationsService.getSourceAttendees(id, { source, medium, campaign });
  }

  @Get('spaces/:spaceId/registration-sources')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW)
  @ApiOperation({
    summary: 'Confirmed registrations across the space, by utm source, split per event',
  })
  @ApiResponse({ status: 200 })
  async getSpaceRegistrationSources(@Param('spaceId') spaceId: string) {
    return this.registrationsService.getSpaceRegistrationSources(spaceId);
  }

  @Get('events/:id/attendee-stats')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'How many people are attending, split into individual bookings and ' +
      'groups (organiser only)',
  })
  @ApiResponse({ status: 200 })
  async getAttendeeStats(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getAttendeeStats(req.user.id, id);
  }

  @Get('events/:id/registrations/export')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Export attendees, transactions, waiting list, check-ins or coupon redemptions as CSV, Excel or PDF (Growth plan+)',
  })
  @ApiResponse({ status: 200 })
  async exportRegistrations(
    @Request() req,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('type') type?: string,
  ) {
    const fmt =
      format === 'xlsx' || format === 'pdf' || format === 'csv'
        ? format
        : 'csv';
    const exportType = (
      ['transactions', 'waitlist', 'checkins', 'coupons'] as const
    ).find((t) => t === type) ?? 'attendees';
    const { stream, contentType, filename } =
      await this.registrationsService.exportRegistrations(
        req.user.id,
        id,
        fmt,
        exportType,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    // Every format streams as it is read. A failure mid-stream can't become an
    // error status any more, so cut the connection rather than send a short file.
    stream.on('error', (err) => {
      new Logger('RegistrationsExport').error(
        `Export ${id} failed mid-stream: ${err.message}`,
      );
      res.destroy(err);
    });
    stream.pipe(res);
  }

  /**
   * Download the CSV import template for one ticket type. Columns are derived
   * from the ticket's kind + custom form fields. Declared before the
   * `:registrationId` GET so the static path wins the route match.
   */
  @Get('events/:id/registrations/import-template')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @ApiOperation({ summary: 'Download the CSV attendee-import template for a ticket type' })
  @ApiResponse({ status: 200 })
  async downloadImportTemplate(
    @Param('id') eventId: string,
    @Query('ticketTypeId') ticketTypeId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await this.registrationsService.buildImportTemplate(eventId, ticketTypeId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }

  /**
   * Bulk-import attendees for a ticket type from an uploaded CSV. Every imported
   * attendee is comped (no payment). Returns a per-row report.
   */
  @Post('events/:id/registrations/import')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @UseInterceptors(FileInterceptor('file', uploadLimit(5)))
  @ApiOperation({ summary: 'Bulk-import attendees from a CSV (comped, no payment)' })
  @ApiResponse({ status: 201 })
  async importAttendees(
    @Param('id') eventId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('ticketTypeId') ticketTypeId: string,
    @Body('sendTicketEmails') sendTicketEmails?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    if (!ticketTypeId) {
      throw new BadRequestException('ticketTypeId is required.');
    }
    return this.registrationsService.importAttendees(
      eventId,
      ticketTypeId,
      file.buffer.toString('utf8'),
      sendTicketEmails === 'true',
    );
  }

  /**
   * Dry-run a bulk import: validate the uploaded CSV and return a per-row preview
   * of what committing would do (create / skip / error), creating nothing. Powers
   * the "review before import" step. Same auth + upload handling as the import.
   */
  @Post('events/:id/registrations/import/preview')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @UseInterceptors(FileInterceptor('file', uploadLimit(5)))
  @ApiOperation({ summary: 'Dry-run a CSV import and preview the per-row outcome' })
  @ApiResponse({ status: 201 })
  async previewImportAttendees(
    @Param('id') eventId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('ticketTypeId') ticketTypeId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    if (!ticketTypeId) {
      throw new BadRequestException('ticketTypeId is required.');
    }
    return this.registrationsService.previewImport(
      eventId,
      ticketTypeId,
      file.buffer.toString('utf8'),
    );
  }

  /**
   * Manually add a single attendee. Comps them (confirmed immediately) unless
   * `collectPayment` is set on a paid ticket, in which case Razorpay sends them a
   * payment link and the seat is held PENDING until paid.
   */
  @Post('events/:id/registrations/manual')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @ApiOperation({ summary: 'Manually add one attendee (comp or send a payment link)' })
  @ApiResponse({ status: 201 })
  async manualAddAttendee(
    @Request() req,
    @Param('id') eventId: string,
    @Body() dto: ManualAddAttendeeDto,
  ) {
    return this.registrationsService.manualAddAttendee(eventId, dto, req.user.id);
  }

  /**
   * Curator / Co-Curator / Space Admin blast: send the event's WhatsApp
   * group/community invite to every confirmed attendee not yet invited and not
   * self-marked as joined. Gated by the same capability as managing attendees.
   */
  @Post('events/:id/whatsapp-group-invite')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @ApiOperation({ summary: 'Send the WhatsApp group invite to un-invited attendees' })
  @ApiResponse({ status: 201 })
  async sendWhatsappGroupInvite(@Param('id') eventId: string) {
    return this.registrationsService.sendGroupInviteBlast(eventId);
  }

  @Get('events/:id/registrations/:registrationId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a single registration detail (organiser only)' })
  @ApiResponse({ status: 200 })
  async getRegistrationDetail(
    @Request() req,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.registrationsService.getRegistrationDetail(
      req.user.id,
      id,
      registrationId,
    );
  }

  /** Organiser restores a cancelled registration back to REGISTERED. */
  @Post('events/:id/registrations/:registrationId/restore')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @ApiOperation({ summary: 'Restore a cancelled registration (organiser)' })
  @ApiResponse({ status: 200 })
  async restoreRegistration(
    @Request() req,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.registrationsService.restoreRegistration(
      req.user.id,
      id,
      registrationId,
    );
  }

  /**
   * Organiser cancels a free / unpaid registration; the reason is stored and
   * included in the attendee's cancellation email.
   * Paid tickets are refused: they go through a refund request.
   */
  @Post('events/:id/registrations/:registrationId/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @ApiOperation({ summary: 'Cancel a free registration (organiser)' })
  @ApiResponse({ status: 201 })
  async organiserCancelRegistration(
    @Request() req,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: CancelMyRegistrationDto,
  ) {
    return this.registrationsService.organiserCancelRegistration(
      req.user.id,
      id,
      registrationId,
      dto.reason,
    );
  }

  /**
   * Curator retires an unfilled seat in a group registration (OPEN/INVITED →
   * RELEASED). Capacity stays held; nothing is resold or refunded.
   */
  @Post('events/:id/registrations/:registrationId/seats/:seatIndex/release')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @ApiOperation({ summary: 'Release an unfilled group seat (organiser)' })
  @ApiResponse({ status: 201 })
  async releaseGroupSeat(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
  ) {
    return this.registrationsService.releaseGroupSeat(
      id,
      registrationId,
      seatIndex,
    );
  }

  /** Curator brings a retired seat back into play (RELEASED → OPEN). */
  @Post('events/:id/registrations/:registrationId/seats/:seatIndex/reopen')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @ApiOperation({ summary: 'Reopen a released group seat (organiser)' })
  @ApiResponse({ status: 201 })
  async reopenGroupSeat(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
  ) {
    return this.registrationsService.reopenGroupSeat(
      id,
      registrationId,
      seatIndex,
    );
  }

  /** Admin transfers a registration directly (no request needed). */
  @Post('events/:id/registrations/:registrationId/transfer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  @ApiOperation({
    summary: 'Transfer a registration to another account by email (admin)',
  })
  @ApiResponse({ status: 200 })
  async transferRegistration(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: TransferRegistrationDto,
  ) {
    return this.registrationsService.adminTransferRegistration(
      id,
      registrationId,
      dto.email,
    );
  }

  /** Organiser requests a transfer for an admin to review. */
  @Post('events/:id/registrations/:registrationId/transfer-request')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Request a registration transfer (organiser)' })
  @ApiResponse({ status: 201 })
  async requestTransfer(
    @Request() req,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: CreateTransferRequestDto,
  ) {
    return this.registrationsService.requestRegistrationTransfer(
      req.user.id,
      id,
      registrationId,
      dto.email,
      dto.reason,
    );
  }

  /** Organiser's own transfer requests. */
  @Get('registration-transfer-requests/my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'My registration transfer requests (organiser)' })
  @ApiResponse({ status: 200 })
  async myTransferRequests(@Request() req) {
    return this.registrationsService.getMyTransferRequests(req.user.id);
  }

  /** Admin inbox of transfer requests. */
  @Get('registration-transfer-requests')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'All registration transfer requests (admin)' })
  @ApiResponse({ status: 200 })
  async allTransferRequests(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.registrationsService.getAllTransferRequests(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** Admin approves (performs the transfer) or rejects a request. */
  @Patch('registration-transfer-requests/:requestId/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Review a registration transfer request (admin)' })
  @ApiResponse({ status: 200 })
  async reviewTransferRequest(
    @Request() req,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewTransferRequestDto,
  ) {
    return this.registrationsService.reviewTransferRequest(
      requestId,
      req.user.id,
      dto.status,
      dto.reviewNote,
      dto.email,
    );
  }

  @Get('users/me/registrations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my event registration history' })
  @ApiResponse({ status: 200 })
  async getMyRegistrations(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('scope') scope?: string,
  ) {
    return this.registrationsService.getMyRegistrations(
      req.user.id,
      +page,
      +limit,
      scope === 'cancelled' ? 'cancelled' : 'active',
    );
  }

  /** Deletes a finished ticket from my own list (the registration stays). */
  @Delete('users/me/registrations/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a finished ticket from my ticket list' })
  @ApiResponse({ status: 200 })
  async hideMyTicket(
    @Request() req,
    @Param('id', ParseUUIDPipe) registrationId: string,
  ) {
    return this.registrationsService.hideMyTicket(req.user.id, registrationId);
  }

  @Get('users/me/member-tickets')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tickets where I am a group member (not the lead)' })
  @ApiResponse({ status: 200 })
  async getMyMemberTickets(@Request() req) {
    return this.registrationsService.getMyMemberTickets(req.user.id);
  }

  // --- Waiting list -------------------------------------------------------

  @Get('users/me/waitlist')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'My waiting list entries, with queue position and any open offer',
  })
  @ApiResponse({ status: 200 })
  async getMyWaitlist(@Request() req) {
    return this.waitlistService.myEntries(req.user.id);
  }

  @Post('registrations/:id/waitlist/pay')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Create the Razorpay order to claim an offered waiting list spot. ' +
      'Verify it through the normal /events/:id/register/verify route.',
  })
  @ApiResponse({ status: 201 })
  async payForWaitlistOffer(@Request() req, @Param('id') registrationId: string) {
    return this.registrationsService.createWaitlistOfferOrder(
      req.user.id,
      registrationId,
    );
  }

  /** Attendee cancels their own free registration (paid → refund flow). */
  @Post('registrations/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel my free registration by id' })
  @ApiResponse({ status: 200 })
  async cancelMyRegistration(
    @Request() req,
    @Param('id') registrationId: string,
    @Body() dto: CancelMyRegistrationDto,
  ) {
    return this.registrationsService.cancelMyRegistration(
      registrationId,
      req.user.id,
      dto.reason,
    );
  }

  @Delete('registrations/:id/waitlist')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Leave the waiting list, or turn down an offered spot' })
  @ApiResponse({ status: 200 })
  async leaveWaitlist(@Request() req, @Param('id') registrationId: string) {
    return this.waitlistService.decline(req.user.id, registrationId);
  }

  @Get('events/:id/waitlist')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'The event waiting list in join order (organiser only)' })
  @ApiResponse({ status: 200 })
  async getEventWaitlist(
    @Request() req,
    @Param('id') eventId: string,
    @Query('ticketTypeId') ticketTypeId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.waitlistService.listForEvent(req.user.id, eventId, {
      ticketTypeId,
      status: status as any,
      search,
      page: +page,
      limit: +limit,
    });
  }

  @Get('events/:id/waitlist/summary')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Waiting list counts per ticket type (organiser only)' })
  @ApiResponse({ status: 200 })
  async getWaitlistSummary(@Request() req, @Param('id') eventId: string) {
    return this.waitlistService.summaryForEvent(req.user.id, eventId);
  }

  @Post('events/:id/waitlist/:registrationId/allow')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Let one person off the waiting list. Holds a seat for them; a paid ' +
      'ticket then needs payment before the deadline (organiser only)',
  })
  @ApiResponse({ status: 201 })
  async allowFromWaitlist(
    @Request() req,
    @Param('id') eventId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.waitlistService.offer(req.user.id, eventId, registrationId);
  }

  @Post('events/:id/waitlist/:registrationId/revoke')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Revoke an unpaid offer and release the held seat back to the pool. ' +
      'Offers have no automatic expiry, so this is how a held seat is freed ' +
      'when the buyer never pays (organiser only)',
  })
  @ApiResponse({ status: 201 })
  async revokeFromWaitlist(
    @Request() req,
    @Param('id') eventId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.waitlistService.revoke(req.user.id, eventId, registrationId);
  }

  @Post('events/:id/waitlist/allow-next')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Let the next N people in for a ticket type, in join order. Stops when ' +
      'the seats run out rather than failing (organiser only)',
  })
  @ApiResponse({ status: 201 })
  async allowNextFromWaitlist(
    @Request() req,
    @Param('id') eventId: string,
    @Body() dto: AllowNextFromWaitlistDto,
  ) {
    return this.waitlistService.offerNext(
      req.user.id,
      eventId,
      dto.ticketTypeId,
      dto.count ?? 1,
    );
  }

  @Post('registrations/razorpay-webhook')
  @ApiOperation({ summary: 'Handle Razorpay webhooks' })
  @ApiResponse({ status: 200 })
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Req() req: { rawBody?: Buffer },
    @Headers('x-razorpay-event-id') razorpayEventId?: string,
  ) {
    // Razorpay signs the exact bytes it POSTs. Verify against req.rawBody
    // (preserved by `rawBody: true` in main.ts), never a re-serialised object —
    // re-stringifying the parsed body changes key order/whitespace and breaks
    // the HMAC, silently 400-ing every webhook.
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    return this.registrationsService.handleRazorpayWebhook(rawBody, signature, razorpayEventId);
  }
}
