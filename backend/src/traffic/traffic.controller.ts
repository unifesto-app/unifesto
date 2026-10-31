import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { TrafficService } from './traffic.service';
import {
  CreateAdminShortLinkDto,
  CreateShortLinkDto,
  CreateSpaceShortLinkDto,
  RecordViewDto,
  RecordWebViewDto,
  TrafficRangeQuery,
} from './dto';

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

  /** Page-view beacon from the website (any public page). Anonymous, cookieless. */
  @Post('traffic/web-views')
  @HttpCode(200)
  recordWebView(@Body() dto: RecordWebViewDto, @Req() req: Request) {
    return this.traffic.recordWebView(dto, { ip: req.ip, ua: req.get('user-agent') });
  }

  /** Short link redirect: https://unifesto.app/l/<code> (also on api.unifesto.app). */
  @Get('l/:code')
  async redirect(@Param('code') code: string, @Req() req: Request, @Res() res: Response) {
    const url = await this.traffic.resolve(code, {
      ip: req.ip,
      ua: req.get('user-agent'),
      referer: req.get('referer'),
      country: req.get('cf-ipcountry'),
    });
    // Never cached, so every click reaches us and is counted.
    res.set('Cache-Control', 'no-store');
    res.redirect(302, url);
  }

  /** QR of a short link: /l/<code>/qr (SVG) or /l/<code>/qr?format=png. */
  @Get('l/:code/qr')
  async qr(@Param('code') code: string, @Query('format') format: string | undefined, @Res() res: Response) {
    const png = format === 'png';
    const body = await this.traffic.qr(code, png ? 'png' : 'svg');
    if (!body) throw new NotFoundException('Short link not found');
    res.set('Cache-Control', 'public, max-age=86400');
    res.type(png ? 'png' : 'image/svg+xml');
    if (png) res.attachment(`unifesto-${code}.png`);
    res.send(body);
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
