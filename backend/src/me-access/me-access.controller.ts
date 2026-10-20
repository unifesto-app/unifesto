import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { CheckinService } from '../checkin/checkin.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { SponsorPortalService } from '../sponsors/sponsor-portal.service';
import { AuthorizationService } from '../auth/authorization';

/**
 * Everything the mobile Space tab needs to decide what this user operates, in
 * one call instead of four (spaces, check-in, judging, sponsor portal). Each
 * part degrades to empty on its own, like the four separate calls did.
 */
@ApiTags('Users')
@Controller('users')
export class MeAccessController {
  constructor(
    private readonly users: UsersService,
    private readonly checkin: CheckinService,
    private readonly leaderboard: LeaderboardService,
    private readonly sponsorPortal: SponsorPortalService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get('me/access')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'My operator spaces, check-in events, judging events, sponsorships and platform capabilities' })
  async getMyAccess(@CurrentUser() user: User) {
    const [spaces, checkin, judging, sponsorships, platform] = await Promise.all([
      this.users.getUserSpaces(user.id, { includeEventRoles: true }).catch(() => []),
      this.checkin.getMyCheckinEvents(user.id).catch(() => ({ events: [] })),
      this.leaderboard.getMyJudgingEvents(user.id).catch(() => ({ events: [] })),
      this.sponsorPortal.getMySponsors(user.id).catch(() => []),
      this.authz.platformActions(user).catch(() => []),
    ]);
    return {
      spaces,
      checkinEvents: checkin.events ?? [],
      judgingEvents: judging.events ?? [],
      sponsorships,
      // PLATFORM capabilities (company:*, product:*, platform:manage) for Apex.
      platform,
    };
  }
}
