import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupSeatsService } from './group-seats.service';
import { ClaimSeatDto, InviteSeatsDto } from './dto/group-seat.dto';

@Controller('registrations')
@UseGuards(JwtAuthGuard)
export class GroupSeatsController {
  constructor(private readonly seats: GroupSeatsService) {}

  // ── Claim (member-facing) — declared before the `:id/...` routes, and
  //    throttled since the token is a capability. ──────────────────────────────

  /** Pending seat invites sent to my account's emails (home "claim" card). */
  @Get('invites/mine')
  listMyInvites(@Request() req) {
    return this.seats.listMyInvites(req.user.id);
  }

  @Get('claim/:token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  getClaimInfo(@Request() req, @Param('token') token: string) {
    return this.seats.getClaimInfo(token, req.user.id);
  }

  @Post('claim/:token')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  claim(@Request() req, @Param('token') token: string, @Body() dto: ClaimSeatDto) {
    return this.seats.claim(token, req.user.id, dto.memberDetails);
  }

  @Post('claim/:token/decline')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  decline(@Request() req, @Param('token') token: string) {
    return this.seats.decline(token, req.user.id);
  }

  /** Re-send my registration email + WhatsApp confirmation (lead or claimed member). */
  @Post(':id/resend-confirmation')
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  resendConfirmation(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.seats.resendConfirmation(id, req.user.id);
  }

  // ── Lead-managed (registration-scoped) ──────────────────────────────────────

  @Get(':id/seats')
  listSeats(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.seats.listSeats(id, req.user.id);
  }

  @Post(':id/seats/invite')
  invite(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteSeatsDto,
  ) {
    return this.seats.invite(id, req.user.id, dto.invites);
  }

  @Post(':id/seats/:seatIndex/revoke')
  revoke(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
  ) {
    return this.seats.revoke(id, req.user.id, seatIndex);
  }

  @Post(':id/seats/:seatIndex/release')
  release(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
  ) {
    return this.seats.releaseAsLead(id, req.user.id, seatIndex);
  }

  @Post(':id/seats/:seatIndex/reopen')
  reopen(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
  ) {
    return this.seats.reopenAsLead(id, req.user.id, seatIndex);
  }
}
