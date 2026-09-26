import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateTicketDto, CreateMessageDto, UpdateTicketDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  RoleCode,
  SupportTicketStatus,
  SupportTicketCategory,
  SupportTicketPriority,
} from '@prisma/client';

@ApiTags('Support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

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
   * List tickets. Role-scoped: admins see every ticket (with filters);
   * everyone else sees only the tickets they raised.
   */
  @Get('tickets')
  @ApiOperation({ summary: 'List support tickets (role-scoped)' })
  listTickets(
    @Req() req: any,
    @Query('status') status?: SupportTicketStatus,
    @Query('category') category?: SupportTicketCategory,
    @Query('priority') priority?: SupportTicketPriority,
    @Query('assignedToId') assignedToId?: string,
    @Query('spaceId') spaceId?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.supportService.listTickets(req.user.id, {
      status,
      category,
      priority,
      assignedToId,
      spaceId,
      search,
      page,
      limit,
    });
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

  /** Post a reply to a ticket (owner or admin). */
  @Post('tickets/:id/messages')
  @ApiOperation({ summary: 'Reply to a support ticket' })
  addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
    @Req() req: any,
  ) {
    return this.supportService.addMessage(id, dto, req.user.id);
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
  ) {
    return this.supportService.updateTicket(id, dto);
  }
}
