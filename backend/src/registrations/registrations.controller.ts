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
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import type { Response } from 'express';
import { RegistrationsService } from './registrations.service';
import {
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
  PrintBadgesDto,
} from './dto';
import { BadgesService } from './badges.service';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { RoleCode } from '@prisma/client';
import { Can, CanGuard, Action } from '../auth/authorization';
import { toPage, toLimit } from '../common/pagination';

@Controller()
export class RegistrationsController {
  constructor(
    private readonly registrationsService: RegistrationsService,
    private readonly waitlistService: WaitlistService,
    private readonly badges: BadgesService,
  ) {}

  @Post('events/:id/register/create-order')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getMyRegistration(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getMyRegistration(req.user.id, id);
  }

  @Get('events/:id/my-registrations')
  @UseGuards(JwtAuthGuard)
  async getMyRegistrationsForEvent(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getMyRegistrationsForEvent(req.user.id, id);
  }

  @Get('registrations/:id/checkins')
  @UseGuards(JwtAuthGuard)
  async getMyRegistrationCheckins(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getMyRegistrationCheckins(req.user.id, id);
  }

  @Get('registrations/:id/group-members')
  @UseGuards(JwtAuthGuard)
  async getMyGroupMembers(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getMyGroupMembers(req.user.id, id);
  }

  @Patch('registrations/:id/group-members')
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } }) // it emails new members their ticket (A28)
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async cancelRegistration(
    @Request() req,
    @Param('id') id: string,
    @Query('ticketTypeId') ticketTypeId?: string,
    @Query('reason') reason?: string,
  ) {
    return this.registrationsService.cancelRegistration(id, req.user.id, ticketTypeId, reason);
  }

  @Get('events/:id/registrations')
  @UseGuards(JwtAuthGuard)
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
      toPage(page),
      toLimit(limit),
      search,
      status as any,
      paymentStatus as any,
      ticketTypeId,
      attendingOnly === 'true',
    );
  }

  @Get('events/:id/registration-sources')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW)
  async getRegistrationSources(@Param('id') id: string) {
    return this.registrationsService.getRegistrationSources(id);
  }

  @Get('events/:id/registration-sources/attendees')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  async getSourceAttendees(
    @Param('id') id: string,
    @Query('source') source?: string,
    @Query('medium') medium?: string,
    @Query('campaign') campaign?: string,
  ) {
    return this.registrationsService.getSourceAttendees(id, { source, medium, campaign });
  }

  @Get('spaces/:spaceId/registration-sources')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW)
  async getSpaceRegistrationSources(@Param('spaceId') spaceId: string) {
    return this.registrationsService.getSpaceRegistrationSources(spaceId);
  }

  @Get('events/:id/attendee-stats')
  @UseGuards(JwtAuthGuard)
  async getAttendeeStats(@Request() req, @Param('id') id: string) {
    return this.registrationsService.getAttendeeStats(req.user.id, id);
  }

  @Post('events/:id/registrations/badges')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async printBadges(@Param('id') id: string, @Body() dto: PrintBadgesDto, @Res() res: Response) {
    const { stream, filename } = await this.badges.render(id, {
      layout: dto.layout,
      registrationIds: dto.registrationIds,
      filters: { ticketTypeId: dto.ticketTypeId, status: dto.status, search: dto.search },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.on('error', (err) => {
      new Logger('Badges').error(`Badges ${id} failed mid-stream: ${err.message}`);
      res.destroy(err);
    });
    stream.pipe(res);
  }

  @Get('events/:id/registrations/export')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @UseInterceptors(FileInterceptor('file', uploadLimit(5)))
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  @UseInterceptors(FileInterceptor('file', uploadLimit(5)))
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
  async sendWhatsappGroupInvite(@Param('id') eventId: string) {
    return this.registrationsService.sendGroupInviteBlast(eventId);
  }

  @Get('events/:id/registrations/:registrationId')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
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
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async myTransferRequests(@Request() req) {
    return this.registrationsService.getMyTransferRequests(req.user.id);
  }

  /** Admin inbox of transfer requests. */
  @Get('registration-transfer-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async allTransferRequests(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.registrationsService.getAllTransferRequests(
      status,
      toPage(page),
      toLimit(limit, 20),
    );
  }

  /** Admin approves (performs the transfer) or rejects a request. */
  @Patch('registration-transfer-requests/:requestId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
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
  @UseGuards(JwtAuthGuard)
  async getMyRegistrations(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('scope') scope?: string,
  ) {
    return this.registrationsService.getMyRegistrations(
      req.user.id,
      toPage(page),
      toLimit(limit),
      scope === 'cancelled' ? 'cancelled' : 'active',
    );
  }

  /** Deletes a finished ticket from my own list (the registration stays). */
  @Delete('users/me/registrations/:id')
  @UseGuards(JwtAuthGuard)
  async hideMyTicket(
    @Request() req,
    @Param('id', ParseUUIDPipe) registrationId: string,
  ) {
    return this.registrationsService.hideMyTicket(req.user.id, registrationId);
  }

  @Get('users/me/member-tickets')
  @UseGuards(JwtAuthGuard)
  async getMyMemberTickets(@Request() req) {
    return this.registrationsService.getMyMemberTickets(req.user.id);
  }

  // --- Waiting list -------------------------------------------------------

  @Get('users/me/waitlist')
  @UseGuards(JwtAuthGuard)
  async getMyWaitlist(@Request() req) {
    return this.waitlistService.myEntries(req.user.id);
  }

  @Post('registrations/:id/waitlist/pay')
  @UseGuards(JwtAuthGuard)
  async payForWaitlistOffer(@Request() req, @Param('id') registrationId: string) {
    return this.registrationsService.createWaitlistOfferOrder(
      req.user.id,
      registrationId,
    );
  }

  /** Attendee cancels their own free registration (paid → refund flow). */
  @Post('registrations/:id/cancel')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async leaveWaitlist(@Request() req, @Param('id') registrationId: string) {
    return this.waitlistService.decline(req.user.id, registrationId);
  }

  @Get('events/:id/waitlist')
  @UseGuards(JwtAuthGuard)
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
      page: toPage(page),
      limit: toLimit(limit),
    });
  }

  @Get('events/:id/waitlist/summary')
  @UseGuards(JwtAuthGuard)
  async getWaitlistSummary(@Request() req, @Param('id') eventId: string) {
    return this.waitlistService.summaryForEvent(req.user.id, eventId);
  }

  @Post('events/:id/waitlist/:registrationId/allow')
  @UseGuards(JwtAuthGuard)
  async allowFromWaitlist(
    @Request() req,
    @Param('id') eventId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.waitlistService.offer(req.user.id, eventId, registrationId);
  }

  @Post('events/:id/waitlist/:registrationId/revoke')
  @UseGuards(JwtAuthGuard)
  async revokeFromWaitlist(
    @Request() req,
    @Param('id') eventId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.waitlistService.revoke(req.user.id, eventId, registrationId);
  }

  @Post('events/:id/waitlist/allow-next')
  @UseGuards(JwtAuthGuard)
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
