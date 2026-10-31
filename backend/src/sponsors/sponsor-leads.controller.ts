import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SponsorsService } from './sponsors.service';

/**
 * Attendee-facing sponsor lead capture (P2). An attendee opts in to share their
 * details with a specific sponsor at an event ("I'm interested"), can withdraw
 * that consent, and can read which sponsors they've already opted into so the UI
 * renders the right button state.
 *
 * Any authenticated user may call these; the service enforces that they hold a
 * confirmed registration for the event and that the sponsor is collecting leads.
 * Public sponsor *display* is not here — it rides along in the cached event
 * detail (GET /events/:slug), so unauthenticated visitors see sponsors too.
 */
@UseGuards(JwtAuthGuard)
@Controller('events/:eventId/sponsors')
export class SponsorLeadsController {
  constructor(private readonly sponsors: SponsorsService) {}

  @Get('opt-ins')
  listMyOptIns(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: User,
  ) {
    return this.sponsors.listMyOptIns(user.id, eventId);
  }

  @Post(':eventSponsorId/opt-in')
  optIn(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('eventSponsorId', ParseUUIDPipe) eventSponsorId: string,
    @CurrentUser() user: User,
  ) {
    return this.sponsors.optIn(user.id, eventId, eventSponsorId);
  }

  @Delete(':eventSponsorId/opt-in')
  withdrawOptIn(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('eventSponsorId', ParseUUIDPipe) eventSponsorId: string,
    @CurrentUser() user: User,
  ) {
    return this.sponsors.withdrawOptIn(user.id, eventId, eventSponsorId);
  }
}
