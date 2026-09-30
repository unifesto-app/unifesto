import {
  Body,
  Controller,
  Delete,
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
import { HackathonSetupService } from './hackathon-setup.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import {
  CreateHackathonRoomDto,
  ImportHackathonTeamsDto,
  RenameMyTeamDto,
  UpdateHackathonConfigDto,
  UpdateHackathonRoomDto,
  UpdateHackathonTeamDto,
} from './dto/hackathon.dto';

/**
 * Hackathon mode (docs/hackathon-mobile-plan.md). Curator routes live under
 * `events/:eventId/hackathon` and are gated by `event:manage-leaderboard` in
 * the services; team routes live under `hackathon/:eventId` and are gated by
 * team membership.
 */
@ApiTags('Hackathon')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class HackathonController {
  constructor(
    private readonly setup: HackathonSetupService,
    private readonly teams: HackathonTeamsService,
  ) {}

  // ── Curator: mode + settings ──────────────────────────────────────────────

  @Get('events/:eventId/hackathon')
  @ApiOperation({ summary: 'Curator dashboard: on/off, settings, counts' })
  overview(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.getOverview(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/enable')
  @ApiOperation({ summary: 'Switch hackathon mode on (creates the board if needed)' })
  enable(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.enable(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/disable')
  @ApiOperation({ summary: 'Switch hackathon mode off (data kept)' })
  disable(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.disable(user.id, eventId);
  }

  @Patch('events/:eventId/hackathon/config')
  @ApiOperation({ summary: 'Team ID pattern, team-name question, venue' })
  updateConfig(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateHackathonConfigDto,
  ) {
    return this.setup.updateConfig(user.id, eventId, dto);
  }

  // ── Curator: teams ────────────────────────────────────────────────────────

  @Post('events/:eventId/hackathon/teams/import')
  @ApiOperation({ summary: 'Import attending GROUP registrations as teams (re-runnable)' })
  importTeams(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ImportHackathonTeamsDto,
  ) {
    return this.teams.importTeams(user.id, eventId, dto);
  }

  @Get('events/:eventId/hackathon/teams')
  listTeams(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.teams.listTeams(user.id, eventId);
  }

  @Get('events/:eventId/hackathon/teams/:entrantId')
  getTeam(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
  ) {
    return this.teams.getTeam(user.id, eventId, entrantId);
  }

  @Patch('events/:eventId/hackathon/teams/:entrantId')
  @ApiOperation({ summary: 'Edit a team’s ID, name or room' })
  updateTeam(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
    @Body() dto: UpdateHackathonTeamDto,
  ) {
    return this.teams.updateTeam(user.id, eventId, entrantId, dto);
  }

  // ── Curator: rooms ────────────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/rooms')
  listRooms(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.listRooms(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/rooms')
  createRoom(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateHackathonRoomDto,
  ) {
    return this.setup.createRoom(user.id, eventId, dto);
  }

  @Post('events/:eventId/hackathon/rooms/auto-allocate')
  @ApiOperation({ summary: 'Fill free room places with teams that have no room' })
  autoAllocate(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.setup.autoAllocate(user.id, eventId);
  }

  @Patch('events/:eventId/hackathon/rooms/:roomId')
  updateRoom(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: UpdateHackathonRoomDto,
  ) {
    return this.setup.updateRoom(user.id, eventId, roomId, dto);
  }

  @Delete('events/:eventId/hackathon/rooms/:roomId')
  deleteRoom(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.setup.deleteRoom(user.id, eventId, roomId);
  }

  // ── Team member ───────────────────────────────────────────────────────────

  @Get('hackathon/:eventId/me')
  @ApiOperation({ summary: 'My team hub (null when the event runs no hackathon). Never includes marks.' })
  myHub(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.teams.getMyHub(user.id, eventId);
  }

  @Patch('hackathon/:eventId/me/team-name')
  @ApiOperation({ summary: 'Team lead renames the team' })
  renameMyTeam(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: RenameMyTeamDto,
  ) {
    return this.teams.renameMyTeam(user.id, eventId, dto.name);
  }
}
