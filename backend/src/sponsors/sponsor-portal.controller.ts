import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SponsorPortalService } from './sponsor-portal.service';
import { BoothScanDto, UpdatePortalLeadDto } from './dto/sponsor.dto';

/**
 * The sponsor portal API (P5). Any authenticated user may call these; access to
 * a specific sponsor's data is enforced per-call by SponsorUser membership in
 * the service (not the space/event role matrix). `GET /me` doubles as the
 * "which sponsors am I?" probe the space app's /sponsor surface gates on.
 */
@ApiTags('Sponsor Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sponsor-portal')
export class SponsorPortalController {
  constructor(private readonly portal: SponsorPortalService) {}

  @Get('me')
  @ApiOperation({ summary: 'Sponsors the caller can act for, with their events' })
  me(@CurrentUser() user: User) {
    return this.portal.getMySponsors(user.id);
  }

  @Get('sponsors/:sponsorId/leads')
  @ApiOperation({ summary: 'Leads captured for one of my sponsors' })
  leads(@CurrentUser() user: User, @Param('sponsorId', ParseUUIDPipe) sponsorId: string) {
    return this.portal.getSponsorLeads(user.id, sponsorId);
  }

  @Patch('sponsors/:sponsorId/leads/:leadId')
  @ApiOperation({ summary: 'Set my status or note on one of my leads' })
  updateLead(
    @CurrentUser() user: User,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: UpdatePortalLeadDto,
  ) {
    return this.portal.updateLead(user.id, sponsorId, leadId, dto);
  }

  @Post('sponsors/:sponsorId/scan')
  @ApiOperation({ summary: 'Booth scan an attendee ticket (the attendee agreed on the prompt)' })
  scan(
    @CurrentUser() user: User,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
    @Body() dto: BoothScanDto,
  ) {
    return this.portal.boothScan(user.id, sponsorId, dto);
  }
}
