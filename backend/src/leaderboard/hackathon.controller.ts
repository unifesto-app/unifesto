import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HackathonSetupService } from './hackathon-setup.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonStatementsService } from './hackathon-statements.service';
import {
  CreateHackathonRoomDto,
  CreateHackathonStatementDto,
  CreateHackathonThemeDto,
  SetTeamStatementDto,
  UpdateHackathonStatementDto,
  UpdateHackathonThemeDto,
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
    private readonly statements: HackathonStatementsService,
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
  @ApiOperation({ summary: 'Team ID pattern, team-name question, venue, problem-statement mode + deadline' })
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

  @Put('events/:eventId/hackathon/teams/:entrantId/statement')
  @ApiOperation({ summary: 'Assign or change a team’s problem statement + theme (locks it)' })
  assignStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
    @Body() dto: SetTeamStatementDto,
  ) {
    return this.statements.assignStatement(user.id, eventId, entrantId, dto);
  }

  @Post('events/:eventId/hackathon/teams/:entrantId/statement/unlock')
  @ApiOperation({ summary: 'Reopen a team’s problem statement so it can choose again' })
  unlockStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('entrantId', ParseUUIDPipe) entrantId: string,
  ) {
    return this.statements.unlockStatement(user.id, eventId, entrantId);
  }

  // ── Curator: themes ───────────────────────────────────────────────────────

  @Get('events/:eventId/hackathon/themes')
  listThemes(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.statements.listThemes(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/themes')
  createTheme(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateHackathonThemeDto,
  ) {
    return this.statements.createTheme(user.id, eventId, dto);
  }

  @Patch('events/:eventId/hackathon/themes/:themeId')
  updateTheme(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('themeId', ParseUUIDPipe) themeId: string,
    @Body() dto: UpdateHackathonThemeDto,
  ) {
    return this.statements.updateTheme(user.id, eventId, themeId, dto);
  }

  @Delete('events/:eventId/hackathon/themes/:themeId')
  deleteTheme(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('themeId', ParseUUIDPipe) themeId: string,
  ) {
    return this.statements.deleteTheme(user.id, eventId, themeId);
  }

  // ── Curator: problem statements ───────────────────────────────────────────

  @Get('events/:eventId/hackathon/statements')
  @ApiOperation({ summary: 'Problem statements with the teams on each' })
  listStatements(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.statements.listStatements(user.id, eventId);
  }

  @Post('events/:eventId/hackathon/statements')
  createStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateHackathonStatementDto,
  ) {
    return this.statements.createStatement(user.id, eventId, dto);
  }

  @Patch('events/:eventId/hackathon/statements/:statementId')
  updateStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @Body() dto: UpdateHackathonStatementDto,
  ) {
    return this.statements.updateStatement(user.id, eventId, statementId, dto);
  }

  @Delete('events/:eventId/hackathon/statements/:statementId')
  deleteStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
  ) {
    return this.statements.deleteStatement(user.id, eventId, statementId);
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

  @Get('hackathon/:eventId/statements')
  @ApiOperation({ summary: 'My team’s problem-statement choices: mode, deadline, themes, the list' })
  myStatementOptions(@CurrentUser() user: User, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.statements.getMyOptions(user.id, eventId);
  }

  @Post('hackathon/:eventId/me/statement')
  @ApiOperation({ summary: 'Team lead locks in the team’s problem statement + theme (final)' })
  lockMyStatement(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SetTeamStatementDto,
  ) {
    return this.statements.lockMyStatement(user.id, eventId, dto);
  }
}
