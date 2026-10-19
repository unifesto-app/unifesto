import { Controller, Get, Headers, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { ProjectorService } from './projector.service';

@ApiTags('projector')
@Controller('events/:eventId/projector')
export class ProjectorController {
  constructor(private readonly projector: ProjectorService) {}

  /** The venue screen. The display link sends X-Display-Token; an operator sends their session. */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  snapshot(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Headers('x-display-token') token: string | undefined,
    @CurrentUser() user: User | undefined,
  ) {
    return this.projector.snapshot(eventId, token, user?.id);
  }

  // ---- Organisers: the display link is part of running the event, event:edit ----

  @Get('link')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  link(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.projector.getToken(eventId);
  }

  @Post('link')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  regenerate(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.projector.regenerateToken(eventId);
  }
}
