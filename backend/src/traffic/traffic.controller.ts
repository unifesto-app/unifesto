import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { TrafficService } from './traffic.service';
import { CreateShortLinkDto, TrackViewDto } from './dto';

@ApiTags('traffic')
@Controller()
export class TrafficController {
  constructor(private readonly traffic: TrafficService) {}

  // ---- Public ----

  @Post('track/view')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a view of a public event or space page' })
  trackView(@Request() req, @Body() dto: TrackViewDto) {
    return this.traffic.trackView(dto, req.user?.id ?? null);
  }

  /** The short link itself: a tap goes straight to the tagged page. */
  @Get('l/:code')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Short link redirect (302, counts the click)' })
  async redirect(@Param('code') code: string, @Res() res: Response) {
    const { url } = await this.traffic.resolve(code);
    res.redirect(302, url);
  }

  @Get('short-links/:code')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resolve a short link (counts the click)' })
  resolve(@Param('code') code: string) {
    return this.traffic.resolve(code);
  }

  // ---- Event (curator) ----

  @Get('events/:eventId/page-analytics')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  eventAnalytics(@Param('eventId') eventId: string, @Query('days') days?: string) {
    return this.traffic.eventAnalytics(eventId, Number(days) || undefined);
  }

  @Get('events/:eventId/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_VIEW, { eventKey: 'eventId' })
  listEventLinks(@Param('eventId') eventId: string) {
    return this.traffic.listEventLinks(eventId);
  }

  @Post('events/:eventId/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  createEventLink(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateShortLinkDto,
  ) {
    return this.traffic.createEventLink(eventId, user.id, dto);
  }

  @Delete('events/:eventId/short-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  deleteEventLink(@Param('eventId') eventId: string, @Param('linkId') linkId: string) {
    return this.traffic.deleteLink({ eventId }, linkId);
  }

  // ---- Space ----

  @Get('spaces/:spaceId/page-analytics')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW, { spaceKey: 'spaceId' })
  spaceAnalytics(@Param('spaceId') spaceId: string, @Query('days') days?: string) {
    return this.traffic.spaceAnalytics(spaceId, Number(days) || undefined);
  }

  @Get('spaces/:spaceId/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW, { spaceKey: 'spaceId' })
  listSpaceLinks(@Param('spaceId') spaceId: string) {
    return this.traffic.listSpaceLinks(spaceId);
  }

  @Post('spaces/:spaceId/short-links')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS, { spaceKey: 'spaceId' })
  createSpaceLink(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateShortLinkDto,
  ) {
    return this.traffic.createSpaceLink(spaceId, user.id, dto);
  }

  @Delete('spaces/:spaceId/short-links/:linkId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS, { spaceKey: 'spaceId' })
  deleteSpaceLink(@Param('spaceId') spaceId: string, @Param('linkId') linkId: string) {
    return this.traffic.deleteLink({ spaceId }, linkId);
  }
}
