import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards';
import { Can, CanGuard, Action } from '../auth/authorization';
import { TrafficService } from './traffic.service';
import { RecordViewDto, RecordWebViewDto, TrafficRangeQuery } from './dto';

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

  // ---- Event ----

  @Get('events/:eventId/traffic')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  eventTraffic(@Param('eventId') eventId: string, @Query() q: TrafficRangeQuery) {
    return this.traffic.eventTraffic(eventId, q.days);
  }

  // ---- Space (its page and every event it hosts) ----

  @Get('spaces/:spaceId/traffic')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW, { spaceKey: 'spaceId' })
  spaceTraffic(@Param('spaceId') spaceId: string, @Query() q: TrafficRangeQuery) {
    return this.traffic.spaceTraffic(spaceId, q.days);
  }

  // ---- Platform (Apex screens in the app) ----

  @Get('admin/traffic')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  platformTraffic(@Query() q: TrafficRangeQuery) {
    return this.traffic.platformTraffic(q.days);
  }
}
