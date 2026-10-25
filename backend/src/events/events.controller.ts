import { SeriesSetupSyncInterceptor } from './recurrence/series-setup-sync.interceptor';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { EventStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { BannerPaletteService } from '../banner-palette/banner-palette.service';
import { EventDraftDto, EventDraftService } from './event-draft';
import {
  AddCoHostDto,
  AddTeamMemberDto,
  AttachSubEventDto,
  CancelEventDto,
  RequestEventTransferDto,
  ReviewEventTransferDto,
  RequestSubEventAttachDto,
  ReviewSubEventAttachDto,
  CreateAgendaDto,
  CreateContactDto,
  CreateEventDto,
  CreateFaqDto,
  CreateFormFieldDto,
  CreatePrizeDto,
  CreateSpeakerDto,
  CreateTicketTypeDto,
  EventFilterDto,
  UpdateAgendaDto,
  UpdateContactDto,
  UpdateEventDto,
  UpdateFormFieldDto,
  UpdateFaqDto,
  UpdatePrizeDto,
  UpdateSpeakerDto,
  UpdateTicketTypeDto,
  ReorderTicketTypesDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { toPage } from '../common/pagination';

@ApiTags('Events')
@Controller('events')
@UseInterceptors(SeriesSetupSyncInterceptor)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly bannerPalette: BannerPaletteService,
    private readonly eventDraft: EventDraftService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({ status: 201 })
  async createEvent(@Request() req, @Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get public events with filters' })
  @ApiResponse({ status: 200 })
  async getEvents(@Query() filters: EventFilterDto) {
    return this.eventsService.getEvents(filters);
  }

  @Get('space/:spaceId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Events for a space — drafts/hidden only for its operators, published otherwise',
  })
  @ApiResponse({ status: 200 })
  async getSpaceEvents(
    @Request() req,
    @Param('spaceId') spaceId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('deleted') deleted?: string,
    @Query('when') when?: string,
  ) {
    return this.eventsService.getSpaceEvents(
      spaceId,
      toPage(page),
      Math.min(Math.max(parseInt(limit ?? '', 10) || 20, 1), 100),
      status as EventStatus | undefined,
      // Anything other than the two explicit opt-ins means the normal list, so
      // a malformed value can never accidentally expose hidden events.
      deleted === 'deleted' || deleted === 'all' ? deleted : 'active',
      req.user?.id,
      // Outsiders: `all` adds finished events to the live list.
      when === 'all',
    );
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get event details by slug or id (drafts only for its operators)',
  })
  @ApiResponse({ status: 200 })
  async getEventBySlug(@Request() req, @Param('slug') slug: string) {
    return this.eventsService.getEventBySlug(slug, req.user?.id);
  }

  // Top 8 banner colours by pixel share (mobile event page background).
  // Goes through getEventBySlug so drafts / private events stay gated.
  @Get(':slug/palette')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: "Top 8 colours of the event banner, most frequent first" })
  @ApiResponse({ status: 200 })
  async getEventPalette(@Request() req, @Param('slug') slug: string) {
    const event = await this.eventsService.getEventBySlug(slug, req.user?.id);
    return { colors: await this.bannerPalette.forUrl(event?.coverImageUrl) };
  }

  // Two-segment path, so it never collides with the single-segment `:slug` route.
  @Get(':slug/calendar.ics')
  @ApiOperation({ summary: 'Download a public event as an .ics calendar file' })
  @ApiResponse({ status: 200 })
  async getEventCalendar(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const ics = await this.eventsService.getEventIcs(slug);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.ics"`,
      // Calendar files are effectively immutable per (slug, edit); let clients
      // cache briefly but revalidate so an edited event refreshes reasonably.
      'Cache-Control': 'public, max-age=300',
    });
    res.send(ics);
  }

  // Recurring-series management (event-calendar P2). Two-segment paths, so they
  // never collide with the single-segment `:slug`/`:id` routes.
  @Get(':id/occurrences')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List a recurring series' occurrences" })
  @ApiResponse({ status: 200 })
  async getSeriesOccurrences(@Request() req, @Param('id') id: string) {
    return this.eventsService.getSeriesOccurrences(req.user.id, id);
  }

  @Post(':id/detach-from-series')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Detach one occurrence from its series (edit "this occurrence")',
  })
  @ApiResponse({ status: 201 })
  async detachOccurrence(@Request() req, @Param('id') id: string) {
    return this.eventsService.detachOccurrenceFromSeries(req.user.id, id);
  }

  @Get(':id/whatsapp')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "The event's private WhatsApp attendee-group config (event-level group, " +
      'inherited parent group, and per-ticket-type overrides). Manage-only; ' +
      'never exposed on the public event payload.',
  })
  @ApiResponse({ status: 200 })
  async getEventWhatsAppConfig(@Request() req, @Param('id') id: string) {
    return this.eventsService.getEventWhatsAppConfig(req.user.id, id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update event details' })
  @ApiResponse({ status: 200 })
  async updateEvent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.updateEvent(req.user.id, id, dto);
  }

  @Delete(':id/hide')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Hide a completed or cancelled event. Reversible — nothing is destroyed',
  })
  @ApiResponse({ status: 200 })
  async softDeleteEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.softDeleteEvent(req.user.id, id);
  }

  @Patch(':id/restore')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Bring a hidden event back' })
  @ApiResponse({ status: 200 })
  async restoreEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.restoreEvent(req.user.id, id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Permanently delete a draft or cancelled event. Irreversible, and never ' +
      'allowed for a completed event',
  })
  @ApiResponse({ status: 200 })
  async permanentDeleteEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.permanentDeleteEvent(req.user.id, id);
  }

  @Patch(':id/publish')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Publish event' })
  @ApiResponse({ status: 200 })
  async publishEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.publishEvent(req.user.id, id);
  }

  @Patch(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel event' })
  @ApiResponse({ status: 200 })
  async cancelEvent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.eventsService.cancelEvent(req.user.id, id, dto);
  }

  @Post(':id/cover')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', uploadLimit(10)))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload event cover image' })
  @ApiResponse({ status: 201 })
  async uploadCoverImage(
    @Request() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.eventsService.uploadCoverImage(req.user.id, id, file);
  }

  @Post(':id/ticket-types')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create ticket type' })
  @ApiResponse({ status: 201 })
  async createTicketType(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.eventsService.createTicketType(req.user.id, id, dto);
  }

  // Static sub-paths first so they are not captured by ':typeId'.
  @Get(':id/ticket-types/manage')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'All ticket types incl. hidden/paused, with per-tier stats (operators only)',
  })
  @ApiResponse({ status: 200 })
  async getManageTicketTypes(@Request() req, @Param('id') id: string) {
    return this.eventsService.getManageTicketTypes(req.user.id, id);
  }

  @Patch(':id/ticket-types/reorder')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Set ticket type display order' })
  @ApiResponse({ status: 200 })
  async reorderTicketTypes(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReorderTicketTypesDto,
  ) {
    return this.eventsService.reorderTicketTypes(req.user.id, id, dto.ids);
  }

  @Patch(':id/ticket-types/:typeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update ticket type' })
  @ApiResponse({ status: 200 })
  async updateTicketType(
    @Request() req,
    @Param('id') id: string,
    @Param('typeId') typeId: string,
    @Body() dto: UpdateTicketTypeDto,
  ) {
    return this.eventsService.updateTicketType(req.user.id, id, typeId, dto);
  }

  @Delete(':id/ticket-types/:typeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete ticket type' })
  @ApiResponse({ status: 200 })
  async deleteTicketType(
    @Request() req,
    @Param('id') id: string,
    @Param('typeId') typeId: string,
  ) {
    return this.eventsService.deleteTicketType(req.user.id, id, typeId);
  }

  @Post(':id/ai-draft')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'AI draft of description, agenda and FAQs from notes or a link (M1). Saves nothing.' })
  @ApiResponse({ status: 201 })
  async aiDraft(@Request() req, @Param('id') id: string, @Body() dto: EventDraftDto) {
    return this.eventDraft.draft(req.user.id, id, dto);
  }

  @Post(':id/agenda')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add agenda item' })
  @ApiResponse({ status: 201 })
  async createAgenda(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateAgendaDto,
  ) {
    return this.eventsService.createAgenda(req.user.id, id, dto);
  }

  @Patch(':id/agenda/:agendaId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update agenda item' })
  @ApiResponse({ status: 200 })
  async updateAgenda(
    @Request() req,
    @Param('id') id: string,
    @Param('agendaId') agendaId: string,
    @Body() dto: UpdateAgendaDto,
  ) {
    return this.eventsService.updateAgenda(req.user.id, id, agendaId, dto);
  }

  @Delete(':id/agenda/:agendaId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete agenda item' })
  @ApiResponse({ status: 200 })
  async deleteAgenda(
    @Request() req,
    @Param('id') id: string,
    @Param('agendaId') agendaId: string,
  ) {
    return this.eventsService.deleteAgenda(req.user.id, id, agendaId);
  }

  @Post(':id/speakers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add speaker' })
  @ApiResponse({ status: 201 })
  async createSpeaker(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateSpeakerDto,
  ) {
    return this.eventsService.createSpeaker(req.user.id, id, dto);
  }

  @Patch(':id/speakers/:speakerId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update speaker' })
  @ApiResponse({ status: 200 })
  async updateSpeaker(
    @Request() req,
    @Param('id') id: string,
    @Param('speakerId') speakerId: string,
    @Body() dto: UpdateSpeakerDto,
  ) {
    return this.eventsService.updateSpeaker(req.user.id, id, speakerId, dto);
  }

  @Delete(':id/speakers/:speakerId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete speaker' })
  @ApiResponse({ status: 200 })
  async deleteSpeaker(
    @Request() req,
    @Param('id') id: string,
    @Param('speakerId') speakerId: string,
  ) {
    return this.eventsService.deleteSpeaker(req.user.id, id, speakerId);
  }

  // --- Prizes / Takeaways ---

  @Post(':id/prizes')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add prize / takeaway' })
  @ApiResponse({ status: 201 })
  async createPrize(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreatePrizeDto,
  ) {
    return this.eventsService.createPrize(req.user.id, id, dto);
  }

  @Patch(':id/prizes/:prizeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update prize / takeaway' })
  @ApiResponse({ status: 200 })
  async updatePrize(
    @Request() req,
    @Param('id') id: string,
    @Param('prizeId') prizeId: string,
    @Body() dto: UpdatePrizeDto,
  ) {
    return this.eventsService.updatePrize(req.user.id, id, prizeId, dto);
  }

  @Delete(':id/prizes/:prizeId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete prize / takeaway' })
  @ApiResponse({ status: 200 })
  async deletePrize(
    @Request() req,
    @Param('id') id: string,
    @Param('prizeId') prizeId: string,
  ) {
    return this.eventsService.deletePrize(req.user.id, id, prizeId);
  }

  // --- Contacts ---

  @Post(':id/contacts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add contact' })
  @ApiResponse({ status: 201 })
  async createContact(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.eventsService.createContact(req.user.id, id, dto);
  }

  @Patch(':id/contacts/:contactId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update contact' })
  @ApiResponse({ status: 200 })
  async updateContact(
    @Request() req,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.eventsService.updateContact(req.user.id, id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete contact' })
  @ApiResponse({ status: 200 })
  async deleteContact(
    @Request() req,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.eventsService.deleteContact(req.user.id, id, contactId);
  }

  // --- FAQs ---

  @Post(':id/faqs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add FAQ' })
  @ApiResponse({ status: 201 })
  async createFaq(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateFaqDto,
  ) {
    return this.eventsService.createFaq(req.user.id, id, dto);
  }

  @Patch(':id/faqs/:faqId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update FAQ' })
  @ApiResponse({ status: 200 })
  async updateFaq(
    @Request() req,
    @Param('id') id: string,
    @Param('faqId') faqId: string,
    @Body() dto: UpdateFaqDto,
  ) {
    return this.eventsService.updateFaq(req.user.id, id, faqId, dto);
  }

  @Delete(':id/faqs/:faqId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete FAQ' })
  @ApiResponse({ status: 200 })
  async deleteFaq(
    @Request() req,
    @Param('id') id: string,
    @Param('faqId') faqId: string,
  ) {
    return this.eventsService.deleteFaq(req.user.id, id, faqId);
  }

  @Post(':id/form-fields')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add custom form field' })
  @ApiResponse({ status: 201 })
  async createFormField(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateFormFieldDto,
  ) {
    return this.eventsService.createFormField(req.user.id, id, dto);
  }

  @Patch(':id/form-fields/:fieldId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a custom form field' })
  async updateFormField(
    @Request() req,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateFormFieldDto,
  ) {
    return this.eventsService.updateFormField(req.user.id, id, fieldId, dto);
  }

  @Delete(':id/form-fields/:fieldId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a custom form field' })
  async deleteFormField(
    @Request() req,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.eventsService.deleteFormField(req.user.id, id, fieldId);
  }

  @Get(':id/co-hosts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List the host + co-host spaces for an event' })
  async getCoHosts(@Request() req, @Param('id') id: string) {
    return this.eventsService.listCoHosts(req.user.id, id);
  }

  @Post(':id/co-hosts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Invite a space to co-host (host space only)' })
  async addCoHost(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AddCoHostDto,
  ) {
    return this.eventsService.addCoHost(req.user.id, id, dto.spaceId);
  }

  // --- Ownership transfer (host → co-host, request + accept) ---
  // NOTE: the DELETE /co-hosts/transfer route is declared *before*
  // DELETE /co-hosts/:spaceId below, or Nest would bind spaceId="transfer".

  @Delete(':id/co-hosts/transfer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Rescind a pending ownership transfer (host only)' })
  async cancelOwnershipTransfer(@Request() req, @Param('id') id: string) {
    return this.eventsService.cancelOwnershipTransfer(req.user.id, id);
  }

  @Delete(':id/co-hosts/:spaceId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove a co-host space' })
  async removeCoHost(
    @Request() req,
    @Param('id') id: string,
    @Param('spaceId') spaceId: string,
  ) {
    return this.eventsService.removeCoHost(req.user.id, id, spaceId);
  }

  @Post(':id/co-hosts/transfer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Offer ownership of an event to a co-host (host only)' })
  async requestOwnershipTransfer(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: RequestEventTransferDto,
  ) {
    return this.eventsService.requestOwnershipTransfer(
      req.user.id,
      id,
      dto.toSpaceId,
      dto.reason,
    );
  }

  @Post(':id/co-hosts/transfer/accept')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Accept a pending ownership transfer (receiving space)' })
  async acceptOwnershipTransfer(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReviewEventTransferDto,
  ) {
    return this.eventsService.acceptOwnershipTransfer(
      req.user.id,
      id,
      dto.reviewNote,
    );
  }

  @Post(':id/co-hosts/transfer/decline')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Decline a pending ownership transfer (receiving space)' })
  async declineOwnershipTransfer(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReviewEventTransferDto,
  ) {
    return this.eventsService.declineOwnershipTransfer(
      req.user.id,
      id,
      dto.reviewNote,
    );
  }

  // --- Sub-events (a "big event" grouping several sub-events) ---

  @Get(':id/sub-events')
  @ApiOperation({
    summary: 'List the published sub-events of a parent (public hub)',
  })
  @UseGuards(OptionalJwtAuthGuard)
  async getSubEvents(@Request() req, @Param('id') id: string) {
    return this.eventsService.getSubEvents(id, false, req.user?.id);
  }

  @Get(':id/sub-events/manage')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List all sub-events including drafts (organiser view)',
  })
  async getManagedSubEvents(@Request() req, @Param('id') id: string) {
    return this.eventsService.getSubEventsForManagement(req.user.id, id);
  }

  @Post(':id/sub-events')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Attach an existing event as a sub-event' })
  @ApiResponse({ status: 201 })
  async attachSubEvent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AttachSubEventDto,
  ) {
    return this.eventsService.attachSubEvent(req.user.id, id, dto.eventId);
  }

  // --- Cross-space sub-event attach requests ---
  // Declared before DELETE :id/sub-events/:childId so the literal `requests`
  // segment is never swallowed as a childId.

  @Get(':id/sub-events/requests')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Pending attach requests concerning this event (incoming to approve, outgoing to rescind)',
  })
  async getSubEventAttachRequests(@Request() req, @Param('id') id: string) {
    return this.eventsService.getSubEventAttachRequests(req.user.id, id);
  }

  @Post(':id/sub-events/requests')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Ask a co-host's space to nest its event under this parent",
  })
  @ApiResponse({ status: 201 })
  async requestSubEventAttach(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: RequestSubEventAttachDto,
  ) {
    return this.eventsService.requestSubEventAttach(
      req.user.id,
      id,
      dto.eventId,
      dto.reason,
    );
  }

  @Post(':id/sub-events/requests/:requestId/accept')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Accept a request to nest this event (owning space only)',
  })
  async acceptSubEventAttach(
    @Request() req,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewSubEventAttachDto,
  ) {
    return this.eventsService.acceptSubEventAttach(
      req.user.id,
      requestId,
      dto.reviewNote,
    );
  }

  @Post(':id/sub-events/requests/:requestId/decline')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Decline a request to nest this event (owning space only)',
  })
  async declineSubEventAttach(
    @Request() req,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewSubEventAttachDto,
  ) {
    return this.eventsService.declineSubEventAttach(
      req.user.id,
      requestId,
      dto.reviewNote,
    );
  }

  @Delete(':id/sub-events/requests/:requestId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Rescind a pending attach request (requesting side)' })
  async cancelSubEventAttach(
    @Request() req,
    @Param('requestId') requestId: string,
  ) {
    return this.eventsService.cancelSubEventAttach(req.user.id, requestId);
  }

  @Delete(':id/sub-events/:childId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Detach a sub-event, making it standalone again' })
  async detachSubEvent(
    @Request() req,
    @Param('id') id: string,
    @Param('childId') childId: string,
  ) {
    return this.eventsService.detachSubEvent(req.user.id, id, childId);
  }

  // --- Team ---

  @Get(':id/team')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List the event team' })
  async getEventTeam(@Request() req, @Param('id') id: string) {
    return this.eventsService.getEventTeam(req.user.id, id);
  }

  @Get(':id/team/search')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Search space members to add to the team' })
  async searchTeamCandidates(
    @Request() req,
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    return this.eventsService.searchTeamCandidates(req.user.id, id, q ?? '');
  }

  @Post(':id/team')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add a team member' })
  async addTeamMember(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.eventsService.addTeamMember(
      req.user.id,
      id,
      dto.userId,
      dto.roleCode,
    );
  }

  @Delete(':id/team/:userId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove a team member' })
  async removeTeamMember(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.eventsService.removeTeamMember(req.user.id, id, userId);
  }
}
