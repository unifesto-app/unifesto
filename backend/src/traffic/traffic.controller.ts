import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { TrafficService } from './traffic.service';
import {
  CreateAdminShortLinkDto,
  CreateShortLinkDto,
  CreateSpaceShortLinkDto,
  RecordViewDto,
  TrafficRangeQuery,
} from './dto';

@ApiTags('traffic')
@Controller()
export class TrafficController {
  constructor(private readonly traffic: TrafficService) {}

  // ---- Public ----

  /** Page-view beacon from the app. Anonymous; never fails on unknown pages. */
  @Post('traffic/views')
  @HttpCode(200)
  recordView(@Body() dto: RecordViewDto) {
    return this.traffic.recordView(dto);
  }

  /** Short link redirect: https://api.unifesto.app/l/<code>. */
  @Get('l/:code')
  @ApiExcludeEndpoint()
  async redirect(@Param('code') code: string, @Req() req: Request, @Res() res: Response) {
    const url = await this.traffic.resolve(code, {
      ip: req.ip,
      ua: req.get('user-agent'),
      referer: req.get('referer'),
    });
    // Never cached, so every click reaches us and is counted.
    res.set('Cache-Control', 'no-store');
    res.redirect(302, url);
  }

  // ---- Event ----

  @Get('events/:eventId/traffic')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  eventTraffic(@Param('eventId') eventId: string, @Query() q: TrafficRangeQuery) {
    return this.traffic.eventTraffic(eventId, q.days);
  }

  @Get('events/:eventId/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  eventLinks(@Param('eventId') eventId: string) {
    return this.traffic.list({ eventId });
  }

  @Post('events/:eventId/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  createEventLink(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() dto: CreateShortLinkDto) {
    return this.traffic.createForEvent(eventId, user.id, dto);
  }

  @Get('events/:eventId/short-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  eventLinkStats(
    @Param('eventId') eventId: string,
    @Param('linkId') linkId: string,
    @Query() q: TrafficRangeQuery,
  ) {
    return this.traffic.stats(linkId, { eventId }, q.days);
  }

  @Delete('events/:eventId/short-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  revokeEventLink(@Param('eventId') eventId: string, @Param('linkId') linkId: string) {
    return this.traffic.revoke(linkId, { eventId });
  }

  // ---- Space (its page and every event it hosts) ----

  @Get('spaces/:spaceId/traffic')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW, { spaceKey: 'spaceId' })
  spaceTraffic(@Param('spaceId') spaceId: string, @Query() q: TrafficRangeQuery) {
    return this.traffic.spaceTraffic(spaceId, q.days);
  }

  @Get('spaces/:spaceId/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW, { spaceKey: 'spaceId' })
  spaceLinks(@Param('spaceId') spaceId: string) {
    return this.traffic.list({ spaceId });
  }

  @Post('spaces/:spaceId/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS, { spaceKey: 'spaceId' })
  createSpaceLink(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateSpaceShortLinkDto,
  ) {
    return this.traffic.createForSpace(spaceId, user.id, dto);
  }

  @Get('spaces/:spaceId/short-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW, { spaceKey: 'spaceId' })
  spaceLinkStats(
    @Param('spaceId') spaceId: string,
    @Param('linkId') linkId: string,
    @Query() q: TrafficRangeQuery,
  ) {
    return this.traffic.stats(linkId, { spaceId }, q.days);
  }

  @Delete('spaces/:spaceId/short-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS, { spaceKey: 'spaceId' })
  revokeSpaceLink(@Param('spaceId') spaceId: string, @Param('linkId') linkId: string) {
    return this.traffic.revoke(linkId, { spaceId });
  }

  // ---- Platform (Apex screens in the app) ----

  @Get('admin/traffic')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  platformTraffic(@Query() q: TrafficRangeQuery) {
    return this.traffic.platformTraffic(q.days);
  }

  @Get('admin/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  adminLinks() {
    return this.traffic.list({});
  }

  @Post('admin/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  createAdminLink(@CurrentUser() user: User, @Body() dto: CreateAdminShortLinkDto) {
    return this.traffic.createAdmin(user.id, dto);
  }

  @Get('admin/short-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  adminLinkStats(@Param('linkId') linkId: string, @Query() q: TrafficRangeQuery) {
    return this.traffic.stats(linkId, {}, q.days);
  }

  @Delete('admin/short-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  revokeAdminLink(@Param('linkId') linkId: string) {
    return this.traffic.revoke(linkId, {});
  }
}
