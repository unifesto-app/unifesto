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
import {
  AddSeatsDto,
  ClaimSeatDto,
  InviteSeatsDto,
  LeadTransferDto,
  RespondLeadTransferDto,
  VerifyAddSeatsDto,
} from './dto/group-seat.dto';
import { TeamChangesService } from './team-changes.service';

@Controller('registrations')
@UseGuards(JwtAuthGuard)
export class GroupSeatsController {
  constructor(
    private readonly seats: GroupSeatsService,
    private readonly team: TeamChangesService,
  ) {}

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

  /** A member answers the lead's "take over as lead" request. */
  @Post('lead-transfers/:transferId/respond')
  respondLeadTransfer(
    @Request() req,
    @Param('transferId', ParseUUIDPipe) transferId: string,
    @Body() dto: RespondLeadTransferDto,
  ) {
    return this.team.respondLeadTransfer(transferId, req.user.id, dto.accept);
  }

  /** Confirm a paid add-seats checkout (the webhook settles it too). */
  @Post('seat-purchases/:purchaseId/verify')
  verifyAddSeats(
    @Request() req,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body() dto: VerifyAddSeatsDto,
  ) {
    return this.team.verifyAddSeats(req.user.id, purchaseId, dto);
  }

  // ── Lead-managed (registration-scoped) ──────────────────────────────────────

  @Get(':id/seats')
  listSeats(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.seats.listSeats(id, req.user.id);
  }

  /** Throttled per lead: each call can email every open seat (A28). */
  @Post(':id/seats/invite')
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
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

  // ── Team changes (lead, inside the organiser's window) ──────────────────────

  /** What I can change about this group right now (lead), or a handover for me (member). */
  @Get(':id/team')
  teamState(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.team.getTeamState(id, req.user.id);
  }

  @Post(':id/seats/:seatIndex/remove')
  removeSeat(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
  ) {
    return this.team.removeSeat(id, seatIndex, { by: 'lead', userId: req.user.id });
  }

  /** Add seats that cost nothing (PER_GROUP or free tickets). */
  @Post(':id/seats/add')
  addSeats(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSeatsDto) {
    return this.team.addSeats(id, dto.seats, { by: 'lead', userId: req.user.id });
  }

  /** Start paying for extra seats (PER_PERSON paid tickets). */
  @Post(':id/seats/add/order')
  addSeatsOrder(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSeatsDto) {
    return this.team.createAddSeatsOrder(id, req.user.id, dto.seats);
  }

  @Post(':id/lead-transfer')
  requestLeadTransfer(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeadTransferDto) {
    return this.team.requestLeadTransfer(id, req.user.id, dto.seatIndex);
  }

  @Post(':id/lead-transfer/cancel')
  cancelLeadTransfer(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.team.cancelLeadTransfer(id, req.user.id);
  }
}
