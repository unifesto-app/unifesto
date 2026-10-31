import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadSource, LeadStatus } from '@prisma/client';
import { Action } from '../auth/authorization/actions';
import { Can } from '../auth/authorization/can.decorator';
import { CanGuard } from '../auth/authorization/can.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadDto } from './dto/lead.dto';

/**
 * Curator-facing lead funnel (P4), gated by `space:manage-sponsors` on the
 * `:spaceId` in the path. Lists, filters, manually adds, re-stages and deletes
 * the organiser's interest/inquiry leads. Public capture lives in
 * PublicLeadsController.
 */
@UseGuards(JwtAuthGuard, CanGuard)
@Controller('spaces/:spaceId/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @Can(Action.SPACE_MANAGE_SPONSORS)
  list(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Query('status') status?: LeadStatus,
    @Query('source') source?: LeadSource,
    @Query('eventId') eventId?: string,
  ) {
    return this.leads.listLeads(spaceId, { status, source, eventId });
  }

  @Post()
  @Can(Action.SPACE_MANAGE_SPONSORS)
  create(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Body() dto: CreateLeadDto) {
    return this.leads.createLead(spaceId, dto);
  }

  @Patch(':id')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  update(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.updateLead(spaceId, id, dto);
  }

  @Delete(':id')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  remove(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.leads.deleteLead(spaceId, id);
  }
}
