import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CaptureLeadDto } from './dto/lead.dto';

/**
 * Public lead capture (P4) — no auth. Powers "Notify me" on a public event page
 * and the inquiry form on a public space page. Captures are de-duped per
 * (space, source, event, email) in the service, and the global throttler guard
 * (see app.module) caps abuse.
 */
@ApiTags('Public Leads')
@Controller()
export class PublicLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post('events/:eventId/interest')
  @ApiOperation({ summary: 'Register interest in an event ("Notify me")' })
  eventInterest(
    @Param('eventId') eventId: string,
    @Body() dto: CaptureLeadDto,
  ) {
    return this.leads.captureEventInterest(eventId, dto);
  }

  @Post('spaces/:spaceId/inquiry')
  @ApiOperation({ summary: 'Submit an inquiry to a space' })
  spaceInquiry(
    @Param('spaceId') spaceId: string,
    @Body() dto: CaptureLeadDto,
  ) {
    return this.leads.captureSpaceInquiry(spaceId, dto);
  }
}
