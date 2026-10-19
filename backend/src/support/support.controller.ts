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
  Req,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  ParseEnumPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { uploadLimit } from '../common/upload-limits';
import { ATTACHMENT_MAX_MB, SupportService } from './support.service';
import { SupportCopilot } from './support-copilot';
import { SupportBot } from './support-bot';
import {
  CreateTicketDto,
  CreateMessageDto,
  UpdateTicketDto,
  SendToSpaceDto,
  CannedReplyDto,
  UpdateCannedReplyDto,
  StartAssistDto,
  AssistMessageDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  RoleCode,
  SupportTicketStatus,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportCaseKind,
  SupportDesk,
} from '@prisma/client';

@ApiTags('Support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(
    private readonly supportService: SupportService,
    private readonly copilot: SupportCopilot,
    private readonly bot: SupportBot,
  ) {}

  /**
   * D14: start an Assist bot chat. Opens a BOT-status case and answers; when
   * the bot can't (switched off, no answer) the case goes straight to a person.
   */
  @Post('assist')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Start an Assist bot chat' })
  async startAssist(@Body() dto: StartAssistDto, @Req() req: any) {
    const id = await this.bot.start(req.user.id, dto);
    return this.supportService.getTicket(id, req.user.id);
  }

  /** D14: the next message in my bot chat. */
  @Post('tickets/:id/assist')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Message the Assist bot' })
  async assistMessage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssistMessageDto, @Req() req: any) {
    await this.bot.say(id, req.user.id, dto.body);
    return this.supportService.getTicket(id, req.user.id);
  }

  /** D14: "Talk to a person": my bot chat becomes a case for the desk. */
  @Post('tickets/:id/handoff')
  @ApiOperation({ summary: 'Hand my Assist chat to a person' })
  async handoffAssist(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.bot.handoff(id, req.user.id);
    return this.supportService.getTicket(id, req.user.id);
  }

  /**
   * Raise a support ticket. Available to any authenticated user (attendee or
   * organiser). Pass `spaceId` when raising it from an organiser space.
   */
  @Post('tickets')
  @ApiOperation({ summary: 'Create a support ticket' })
  createTicket(@Body() dto: CreateTicketDto, @Req() req: any) {
    return this.supportService.createTicket(dto, req.user.id);
  }

  /**
   * List tickets. Role-scoped: admins see every ticket (with filters, the
   * Apex Assist inbox); everyone else sees only the tickets they raised.
   */
  @Get('tickets')
  @ApiOperation({ summary: 'List support tickets (role-scoped)' })
  listTickets(
    @Req() req: any,
    @Query('status') status?: SupportTicketStatus,
    @Query('category') category?: SupportTicketCategory,
    @Query('priority') priority?: SupportTicketPriority,
    @Query('kind', new ParseEnumPipe(SupportCaseKind, { optional: true })) kind?: SupportCaseKind,
    @Query('desk', new ParseEnumPipe(SupportDesk, { optional: true })) desk?: SupportDesk,
    @Query('assignedToId') assignedToId?: string,
    @Query('spaceId') spaceId?: string,
    @Query('unread') unread?: string,
    @Query('overdue') overdue?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.supportService.listTickets(req.user.id, {
      status,
      category,
      priority,
      kind,
      desk,
      assignedToId,
      spaceId,
      unread: unread === 'true',
      overdue: overdue === 'true',
      search,
      page,
      limit,
    });
  }

  /**
   * D9: one space's desk inbox. Space Admins see every case on the desk;
   * event support teams see their events' cases. Escalated cases stay listed
   * read-only. 403 when the caller works no part of this desk.
   */
  @Get('spaces/:spaceId/desk')
  @ApiOperation({ summary: "List a space desk's cases" })
  listSpaceDesk(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Req() req: any,
    @Query('status', new ParseEnumPipe(SupportTicketStatus, { optional: true })) status?: SupportTicketStatus,
    @Query('kind', new ParseEnumPipe(SupportCaseKind, { optional: true })) kind?: SupportCaseKind,
    @Query('unread') unread?: string,
    @Query('overdue') overdue?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.supportService.listTickets(req.user.id, {
      deskSpaceId: spaceId,
      status,
      kind,
      unread: unread === 'true',
      overdue: overdue === 'true',
      search,
      page,
      limit,
    });
  }

  /** D9: unread cases on a space desk for the caller (sidebar badge). */
  @Get('spaces/:spaceId/desk/unread')
  @ApiOperation({ summary: 'Unread count for a space desk' })
  spaceDeskUnread(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Req() req: any) {
    return this.supportService.spaceDeskUnread(req.user.id, spaceId);
  }

  /** D19: a space desk's stats header: open, awaiting, overdue, and median reply and resolution times. */
  @Get('spaces/:spaceId/desk/stats')
  @ApiOperation({ summary: 'Stats for a space desk' })
  spaceDeskStats(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Req() req: any) {
    return this.supportService.spaceDeskStats(req.user.id, spaceId);
  }

  /** D19: saved replies for a desk. `spaceId` for a space desk's; none for Unifesto's. */
  @Get('canned-replies')
  @ApiOperation({ summary: "List a desk's saved replies" })
  listCannedReplies(@Req() req: any, @Query('spaceId', new ParseUUIDPipe({ optional: true })) spaceId?: string) {
    return this.supportService.listCannedReplies(req.user.id, spaceId ?? null);
  }

  @Post('canned-replies')
  @ApiOperation({ summary: 'Add a saved reply' })
  createCannedReply(@Body() dto: CannedReplyDto, @Req() req: any) {
    return this.supportService.createCannedReply(req.user.id, dto);
  }

  @Patch('canned-replies/:id')
  @ApiOperation({ summary: 'Edit a saved reply' })
  updateCannedReply(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCannedReplyDto, @Req() req: any) {
    return this.supportService.updateCannedReply(req.user.id, id, dto);
  }

  @Delete('canned-replies/:id')
  @ApiOperation({ summary: 'Delete a saved reply' })
  deleteCannedReply(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.supportService.deleteCannedReply(req.user.id, id);
  }

  /** Summary counts for the current viewer (global for admins, own otherwise). */
  @Get('tickets/stats')
  @ApiOperation({ summary: 'Support ticket counts by status' })
  getStats(@Req() req: any) {
    return this.supportService.getStats(req.user.id);
  }

  /** Full ticket with its message thread (owner or admin). */
  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get a support ticket with its messages' })
  getTicket(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.supportService.getTicket(id, req.user.id);
  }

  /** Post a reply to a ticket (owner or the current desk), or with `internal` a desk-only note. */
  @Post('tickets/:id/messages')
  @ApiOperation({ summary: 'Reply to a support ticket' })
  addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
    @Req() req: any,
  ) {
    return this.supportService.addMessage(id, dto, req.user.id);
  }

  /** Attach a file to your own message (stored privately). */
  @Post('tickets/:id/messages/:messageId/attachments')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', uploadLimit(ATTACHMENT_MAX_MB)))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach an image or PDF to a ticket message' })
  addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.supportService.addAttachment(id, messageId, req.user.id, file);
  }

  /** A 5-minute signed link to an attachment (anyone who can see the case). */
  @Get('attachments/:attachmentId/url')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Signed link to a ticket attachment' })
  attachmentUrl(@Param('attachmentId', ParseUUIDPipe) attachmentId: string, @Req() req: any) {
    return this.supportService.attachmentUrl(attachmentId, req.user.id);
  }

  /** D15: booking policy facts computed by code (refund window, refundable amount). Desk only. */
  @Get('tickets/:id/facts')
  @ApiOperation({ summary: 'Policy facts for a case (desk)' })
  caseFacts(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.copilot.getFacts(id, req.user.id);
  }

  /** D15: an AI reply draft for the desk to edit and send. Nothing is sent. */
  @Post('tickets/:id/draft')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Draft a desk reply with Assist (desk)' })
  draftReply(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.copilot.draft(id, req.user.id);
  }

  /** D15: the staff thread summary, refreshed when a newer message arrived. */
  @Post('tickets/:id/summary')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Summarise a case thread (desk)' })
  summarise(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.copilot.summary(id, req.user.id);
  }

  /** Hand a space-desk case to Unifesto (requester or the space desk). */
  @Post('tickets/:id/escalate')
  @ApiOperation({ summary: 'Escalate a ticket to Unifesto' })
  escalate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.supportService.escalate(id, req.user.id);
  }

  /** Platform hands a help question to an event's organiser (the space desk). */
  @Post('tickets/:id/send-to-space')
  @ApiOperation({ summary: "Send a ticket to an event's organiser (Platform)" })
  sendToSpace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendToSpaceDto, @Req() req: any) {
    return this.supportService.sendToSpace(id, dto.eventId, req.user.id);
  }

  /** Requester closes their own ticket. */
  @Patch('tickets/:id/close')
  @ApiOperation({ summary: 'Close your own ticket' })
  closeOwn(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.supportService.setStatusAsOwner(
      id,
      req.user.id,
      SupportTicketStatus.CLOSED,
    );
  }

  /** Requester reopens their own ticket. */
  @Patch('tickets/:id/reopen')
  @ApiOperation({ summary: 'Reopen your own ticket' })
  reopenOwn(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.supportService.setStatusAsOwner(
      id,
      req.user.id,
      SupportTicketStatus.OPEN,
    );
  }

  /**
   * Admin triage: change status/priority/category or (re)assign the ticket.
   */
  @Patch('tickets/:id')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Update a ticket (ADMIN)' })
  updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
    @Req() req: any,
  ) {
    return this.supportService.updateTicket(id, dto, req.user.id);
  }
}
