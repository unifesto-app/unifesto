import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Action, Can, CanGuard } from '../auth/authorization';
import { AttendeeDetailsService } from './attendee-details.service';
import { GroupSeatsService } from './group-seats.service';
import { TeamChangesService } from './team-changes.service';
import { AddSeatsDto } from './dto/group-seat.dto';
import { AttendeeControlsDto, CuratorUpdateDetailsDto, ReplaceMemberDto, UpdateDetailsDto } from './dto/attendee-details.dto';

/**
 * Attendee controls (4.0.5): curators switch team changes and detail edits on
 * or off per event; attendees edit their details while allowed; leads replace
 * team members while allowed; curators can always do both.
 */
@ApiTags('registrations')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class AttendeeDetailsController {
  constructor(
    private readonly details: AttendeeDetailsService,
    private readonly seats: GroupSeatsService,
    private readonly team: TeamChangesService,
  ) {}

  // ---- Curator ----

  @Patch('events/:eventId/attendee-controls')
  @UseGuards(CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  @ApiOperation({ summary: 'Turn team changes / attendee detail edits on or off (curator)' })
  setControls(@Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: AttendeeControlsDto) {
    return this.details.setControls(eventId, dto);
  }

  @Get('events/:eventId/registrations/:registrationId/details')
  @UseGuards(CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  @ApiOperation({ summary: "A registration's answers and member details (curator)" })
  curatorGet(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    return this.details.getForCurator(eventId, registrationId);
  }

  @Patch('events/:eventId/registrations/:registrationId/details')
  @UseGuards(CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  @ApiOperation({ summary: "Edit a registration's answers or a member's details (curator)" })
  curatorUpdate(
    @Request() req,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() dto: CuratorUpdateDetailsDto,
  ) {
    return this.details.updateForCurator(eventId, registrationId, req.user.id, dto);
  }

  @Post('events/:eventId/registrations/:registrationId/seats/:seatIndex/replace')
  @UseGuards(CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  @ApiOperation({ summary: 'Replace a group member (curator)' })
  curatorReplace(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
    @Body() dto: ReplaceMemberDto,
  ) {
    return this.seats.replaceMember(registrationId, seatIndex, { by: 'curator', eventId, newEmail: dto.email });
  }

  @Post('events/:eventId/registrations/:registrationId/seats/:seatIndex/remove')
  @UseGuards(CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  @ApiOperation({ summary: 'Remove a seat from a group; the team shrinks, no refund (curator)' })
  curatorRemove(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
  ) {
    return this.team.removeSeat(registrationId, seatIndex, { by: 'curator', eventId });
  }

  @Post('events/:eventId/registrations/:registrationId/seats/add')
  @UseGuards(CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  @ApiOperation({ summary: 'Add seats to a group without payment (curator; collect any money outside the app)' })
  curatorAdd(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() dto: AddSeatsDto,
  ) {
    return this.team.addSeats(registrationId, dto.seats, { by: 'curator', eventId });
  }

  @Post('events/:eventId/registrations/:registrationId/seats/:seatIndex/make-lead')
  @UseGuards(CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { eventKey: 'eventId' })
  @ApiOperation({ summary: "Make the member on this seat the group's lead (curator)" })
  curatorMakeLead(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
  ) {
    return this.team.curatorTransfer(eventId, registrationId, seatIndex);
  }

  // ---- Attendee ----

  @Get('registrations/:id/details')
  @ApiOperation({ summary: 'My registration details and whether I can edit them' })
  getMine(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.details.getMine(id, req.user.id);
  }

  @Patch('registrations/:id/details')
  @ApiOperation({ summary: 'Edit my registration details (while the organiser allows it)' })
  updateMine(@Request() req, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDetailsDto) {
    return this.details.updateMine(id, req.user.id, dto);
  }

  @Post('registrations/:id/seats/:seatIndex/replace')
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } }) // it emails the new invitee (A28)
  @ApiOperation({ summary: 'Replace a member of my team (lead, while the organiser allows it)' })
  leadReplace(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seatIndex', ParseIntPipe) seatIndex: number,
    @Body() dto: ReplaceMemberDto,
  ) {
    return this.seats.replaceMember(id, seatIndex, { by: 'lead', leadUserId: req.user.id, newEmail: dto.email });
  }
}
