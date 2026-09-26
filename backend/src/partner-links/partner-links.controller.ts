import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { PartnerLinksService } from './partner-links.service';
import { CreatePartnerLinkDto } from './dto';

@ApiTags('partner-links')
@Controller()
export class PartnerLinksController {
  constructor(private readonly partners: PartnerLinksService) {}

  // ---- Curator management ----

  @Post('events/:eventId/partner-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  create(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: CreatePartnerLinkDto,
  ) {
    return this.partners.create(eventId, user.id, dto);
  }

  @Get('events/:eventId/partner-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  list(@Param('eventId') eventId: string) {
    return this.partners.listForEvent(eventId);
  }

  @Delete('events/:eventId/partner-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  revoke(@Param('eventId') eventId: string, @Param('linkId') linkId: string) {
    return this.partners.revoke(eventId, linkId);
  }

  // ---- Partner (the contact sees only their own links) ----

  @Get('partner-links/mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: User) {
    return this.partners.listMine(user.id);
  }

  @Get('partner-links/:linkId/stats')
  @UseGuards(JwtAuthGuard)
  stats(@CurrentUser() user: User, @Param('linkId') linkId: string) {
    return this.partners.statsForPartner(user.id, linkId);
  }
}
