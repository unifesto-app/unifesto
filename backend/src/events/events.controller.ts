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
import { Audit } from '../audit/audit';

@Controller('events')
@UseInterceptors(SeriesSetupSyncInterceptor)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly bannerPalette: BannerPaletteService,
    private readonly eventDraft: EventDraftService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createEvent(@Request() req, @Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(req.user.id, dto);
  }

  @Get()
  async getEvents(@Query() filters: EventFilterDto) {
    return this.eventsService.getEvents(filters);
  }

  @Get('space/:spaceId')
  @UseGuards(OptionalJwtAuthGuard)
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

  @Get('space/:spaceId/co-host-invites')
  @UseGuards(JwtAuthGuard)
  async listCoHostInvites(@Request() req, @Param('spaceId') spaceId: string) {
    return this.eventsService.listCoHostInvites(req.user.id, spaceId);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  async getEventBySlug(@Request() req, @Param('slug') slug: string) {
    return this.eventsService.getEventBySlug(slug, req.user?.id);
  }

  // Top 8 banner colours by pixel share (mobile event page background).
  // Goes through getEventBySlug so drafts / private events stay gated.
  @Get(':slug/palette')
  @UseGuards(OptionalJwtAuthGuard)
  async getEventPalette(@Request() req, @Param('slug') slug: string) {
    const event = await this.eventsService.getEventBySlug(slug, req.user?.id);
    return { colors: await this.bannerPalette.forUrl(event?.coverImageUrl) };
  }

  // Two-segment path, so it never collides with the single-segment `:slug` route.
  @Get(':slug/calendar.ics')
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
  @UseGuards(JwtAuthGuard)
  async getSeriesOccurrences(@Request() req, @Param('id') id: string) {
    return this.eventsService.getSeriesOccurrences(req.user.id, id);
  }

  @Post(':id/detach-from-series')
  @UseGuards(JwtAuthGuard)
  async detachOccurrence(@Request() req, @Param('id') id: string) {
    return this.eventsService.detachOccurrenceFromSeries(req.user.id, id);
  }

  @Get(':id/whatsapp')
  @UseGuards(JwtAuthGuard)
  async getEventWhatsAppConfig(@Request() req, @Param('id') id: string) {
    return this.eventsService.getEventWhatsAppConfig(req.user.id, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateEvent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.updateEvent(req.user.id, id, dto);
  }

  @Delete(':id/hide')
  @UseGuards(JwtAuthGuard)
  async softDeleteEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.softDeleteEvent(req.user.id, id);
  }

  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard)
  async restoreEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.restoreEvent(req.user.id, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async permanentDeleteEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.permanentDeleteEvent(req.user.id, id);
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard)
  async publishEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.publishEvent(req.user.id, id);
  }

  @Patch(':id/end')
  @UseGuards(JwtAuthGuard)
  async endEvent(@Request() req, @Param('id') id: string) {
    return this.eventsService.endEvent(req.user.id, id);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelEvent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.eventsService.cancelEvent(req.user.id, id, dto);
  }

  @Post(':id/cover')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', uploadLimit(10)))
  async uploadCoverImage(
    @Request() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.eventsService.uploadCoverImage(req.user.id, id, file);
  }

  @Post(':id/ticket-types')
  @UseGuards(JwtAuthGuard)
  async createTicketType(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.eventsService.createTicketType(req.user.id, id, dto);
  }

  // Static sub-paths first so they are not captured by ':typeId'.
  @Get(':id/ticket-types/manage')
  @UseGuards(JwtAuthGuard)
  async getManageTicketTypes(@Request() req, @Param('id') id: string) {
    return this.eventsService.getManageTicketTypes(req.user.id, id);
  }

  @Patch(':id/ticket-types/reorder')
  @UseGuards(JwtAuthGuard)
  async reorderTicketTypes(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReorderTicketTypesDto,
  ) {
    return this.eventsService.reorderTicketTypes(req.user.id, id, dto.ids);
  }

  @Patch(':id/ticket-types/:typeId')
  @UseGuards(JwtAuthGuard)
  async updateTicketType(
    @Request() req,
    @Param('id') id: string,
    @Param('typeId') typeId: string,
    @Body() dto: UpdateTicketTypeDto,
  ) {
    return this.eventsService.updateTicketType(req.user.id, id, typeId, dto);
  }

  @Delete(':id/ticket-types/:typeId')
  @UseGuards(JwtAuthGuard)
  async deleteTicketType(
    @Request() req,
    @Param('id') id: string,
    @Param('typeId') typeId: string,
  ) {
    return this.eventsService.deleteTicketType(req.user.id, id, typeId);
  }

  @Post(':id/ai-draft')
  @UseGuards(JwtAuthGuard)
  async aiDraft(@Request() req, @Param('id') id: string, @Body() dto: EventDraftDto) {
    return this.eventDraft.draft(req.user.id, id, dto);
  }

  @Post(':id/agenda')
  @UseGuards(JwtAuthGuard)
  async createAgenda(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateAgendaDto,
  ) {
    return this.eventsService.createAgenda(req.user.id, id, dto);
  }

  @Patch(':id/agenda/:agendaId')
  @UseGuards(JwtAuthGuard)
  async updateAgenda(
    @Request() req,
    @Param('id') id: string,
    @Param('agendaId') agendaId: string,
    @Body() dto: UpdateAgendaDto,
  ) {
    return this.eventsService.updateAgenda(req.user.id, id, agendaId, dto);
  }

  @Delete(':id/agenda/:agendaId')
  @UseGuards(JwtAuthGuard)
  async deleteAgenda(
    @Request() req,
    @Param('id') id: string,
    @Param('agendaId') agendaId: string,
  ) {
    return this.eventsService.deleteAgenda(req.user.id, id, agendaId);
  }

  @Post(':id/speakers')
  @UseGuards(JwtAuthGuard)
  async createSpeaker(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateSpeakerDto,
  ) {
    return this.eventsService.createSpeaker(req.user.id, id, dto);
  }

  @Patch(':id/speakers/:speakerId')
  @UseGuards(JwtAuthGuard)
  async updateSpeaker(
    @Request() req,
    @Param('id') id: string,
    @Param('speakerId') speakerId: string,
    @Body() dto: UpdateSpeakerDto,
  ) {
    return this.eventsService.updateSpeaker(req.user.id, id, speakerId, dto);
  }

  @Delete(':id/speakers/:speakerId')
  @UseGuards(JwtAuthGuard)
  async deleteSpeaker(
    @Request() req,
    @Param('id') id: string,
    @Param('speakerId') speakerId: string,
  ) {
    return this.eventsService.deleteSpeaker(req.user.id, id, speakerId);
  }

  // --- Prizes / Takeaways ---

  @Post(':id/prizes')
  @UseGuards(JwtAuthGuard)
  async createPrize(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreatePrizeDto,
  ) {
    return this.eventsService.createPrize(req.user.id, id, dto);
  }

  @Patch(':id/prizes/:prizeId')
  @UseGuards(JwtAuthGuard)
  async updatePrize(
    @Request() req,
    @Param('id') id: string,
    @Param('prizeId') prizeId: string,
    @Body() dto: UpdatePrizeDto,
  ) {
    return this.eventsService.updatePrize(req.user.id, id, prizeId, dto);
  }

  @Delete(':id/prizes/:prizeId')
  @UseGuards(JwtAuthGuard)
  async deletePrize(
    @Request() req,
    @Param('id') id: string,
    @Param('prizeId') prizeId: string,
  ) {
    return this.eventsService.deletePrize(req.user.id, id, prizeId);
  }

  // --- Contacts ---

  @Post(':id/contacts')
  @UseGuards(JwtAuthGuard)
  async createContact(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.eventsService.createContact(req.user.id, id, dto);
  }

  @Patch(':id/contacts/:contactId')
  @UseGuards(JwtAuthGuard)
  async updateContact(
    @Request() req,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.eventsService.updateContact(req.user.id, id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @UseGuards(JwtAuthGuard)
  async deleteContact(
    @Request() req,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.eventsService.deleteContact(req.user.id, id, contactId);
  }

  // --- FAQs ---

  @Post(':id/faqs')
  @UseGuards(JwtAuthGuard)
  async createFaq(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateFaqDto,
  ) {
    return this.eventsService.createFaq(req.user.id, id, dto);
  }

  @Patch(':id/faqs/:faqId')
  @UseGuards(JwtAuthGuard)
  async updateFaq(
    @Request() req,
    @Param('id') id: string,
    @Param('faqId') faqId: string,
    @Body() dto: UpdateFaqDto,
  ) {
    return this.eventsService.updateFaq(req.user.id, id, faqId, dto);
  }

  @Delete(':id/faqs/:faqId')
  @UseGuards(JwtAuthGuard)
  async deleteFaq(
    @Request() req,
    @Param('id') id: string,
    @Param('faqId') faqId: string,
  ) {
    return this.eventsService.deleteFaq(req.user.id, id, faqId);
  }

  @Post(':id/form-fields')
  @UseGuards(JwtAuthGuard)
  async createFormField(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateFormFieldDto,
  ) {
    return this.eventsService.createFormField(req.user.id, id, dto);
  }

  @Patch(':id/form-fields/:fieldId')
  @UseGuards(JwtAuthGuard)
  async updateFormField(
    @Request() req,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateFormFieldDto,
  ) {
    return this.eventsService.updateFormField(req.user.id, id, fieldId, dto);
  }

  @Delete(':id/form-fields/:fieldId')
  @UseGuards(JwtAuthGuard)
  async deleteFormField(
    @Request() req,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.eventsService.deleteFormField(req.user.id, id, fieldId);
  }

  @Get(':id/co-hosts')
  @UseGuards(JwtAuthGuard)
  async getCoHosts(@Request() req, @Param('id') id: string) {
    return this.eventsService.listCoHosts(req.user.id, id);
  }

  @Post(':id/co-hosts')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async cancelOwnershipTransfer(@Request() req, @Param('id') id: string) {
    return this.eventsService.cancelOwnershipTransfer(req.user.id, id);
  }

  @Delete(':id/co-hosts/:spaceId')
  @UseGuards(JwtAuthGuard)
  async removeCoHost(
    @Request() req,
    @Param('id') id: string,
    @Param('spaceId') spaceId: string,
  ) {
    return this.eventsService.removeCoHost(req.user.id, id, spaceId);
  }

  @Post(':id/co-hosts/transfer')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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

  // Declared after the /co-hosts/transfer/* routes, which it would otherwise
  // shadow with spaceId="transfer".
  @Post(':id/co-hosts/:spaceId/accept')
  @UseGuards(JwtAuthGuard)
  async acceptCoHost(
    @Request() req,
    @Param('id') id: string,
    @Param('spaceId') spaceId: string,
  ) {
    return this.eventsService.acceptCoHost(req.user.id, id, spaceId);
  }

  // --- Sub-events (a "big event" grouping several sub-events) ---

  @Get(':id/sub-events')
  @UseGuards(OptionalJwtAuthGuard)
  async getSubEvents(@Request() req, @Param('id') id: string) {
    return this.eventsService.getSubEvents(id, false, req.user?.id);
  }

  @Get(':id/sub-events/manage')
  @UseGuards(JwtAuthGuard)
  async getManagedSubEvents(@Request() req, @Param('id') id: string) {
    return this.eventsService.getSubEventsForManagement(req.user.id, id);
  }

  @Post(':id/sub-events')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getSubEventAttachRequests(@Request() req, @Param('id') id: string) {
    return this.eventsService.getSubEventAttachRequests(req.user.id, id);
  }

  @Post(':id/sub-events/requests')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async cancelSubEventAttach(
    @Request() req,
    @Param('requestId') requestId: string,
  ) {
    return this.eventsService.cancelSubEventAttach(req.user.id, requestId);
  }

  @Delete(':id/sub-events/:childId')
  @UseGuards(JwtAuthGuard)
  async detachSubEvent(
    @Request() req,
    @Param('id') id: string,
    @Param('childId') childId: string,
  ) {
    return this.eventsService.detachSubEvent(req.user.id, id, childId);
  }

  // --- Team ---

  @Get(':id/team')
  @UseGuards(JwtAuthGuard)
  async getEventTeam(@Request() req, @Param('id') id: string) {
    return this.eventsService.getEventTeam(req.user.id, id);
  }

  @Get(':id/team/search')
  @UseGuards(JwtAuthGuard)
  async searchTeamCandidates(
    @Request() req,
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    return this.eventsService.searchTeamCandidates(req.user.id, id, q ?? '');
  }

  @Post(':id/team')
  @Audit('event.team.add', (r) => ({ eventId: r.params.id, userId: (r.params.userId ?? r.body?.userId) as string }))
  @UseGuards(JwtAuthGuard)
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
  @Audit('event.team.remove', (r) => ({ eventId: r.params.id, userId: (r.params.userId ?? r.body?.userId) as string }))
  @UseGuards(JwtAuthGuard)
  async removeTeamMember(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.eventsService.removeTeamMember(req.user.id, id, userId);
  }
}
