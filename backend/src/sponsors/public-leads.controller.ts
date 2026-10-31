import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import { CaptureLeadDto } from './dto/lead.dto';

/**
 * Public lead capture (P4) — no auth. Powers "Notify me" on a public event page
 * and the inquiry form on a public space page. Each route allows 5 submissions
 * per caller per 10 minutes (the careers form's limit), on top of the global
 * throttler. The service only accepts what the public can see and never
 * rewrites an existing lead.
 */
@Controller()
export class PublicLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post('events/:eventId/interest')
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  eventInterest(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CaptureLeadDto,
  ) {
    return this.leads.captureEventInterest(eventId, dto);
  }

  @Post('spaces/:spaceId/inquiry')
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  spaceInquiry(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: CaptureLeadDto,
  ) {
    return this.leads.captureSpaceInquiry(spaceId, dto);
  }
}
