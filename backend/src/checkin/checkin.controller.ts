import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CheckinService } from './checkin.service';
import {
  BulkCheckinDto,
  ScanQRCodeDto,
  ManualCheckinDto,
  CreateCheckinTypeDto,
  SetCheckinAccessDto,
  GroupCheckinDto,
  SyncOfflineCheckinsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Check-in')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Post('scan')
  @ApiOperation({ summary: 'Scan QR code to check in attendee at a point' })
  @ApiResponse({ status: 200 })
  async scanQRCode(@Request() req, @Body() dto: ScanQRCodeDto) {
    return this.checkinService.scanQRCode(
      req.user.id,
      dto.qrCode,
      dto.checkinTypeId,
      dto.groupAware ?? false,
    );
  }

  @Post('group')
  @ApiOperation({ summary: 'Check in selected members of a group registration' })
  @ApiResponse({ status: 200 })
  async checkinGroupMembers(@Request() req, @Body() dto: GroupCheckinDto) {
    return this.checkinService.checkinGroupMembers(
      req.user.id,
      dto.registrationId,
      dto.checkinTypeId,
      dto.memberIndexes,
    );
  }

  @Post('manual')
  @ApiOperation({ summary: 'Manually check a registration in at a point' })
  async manualCheckin(@Request() req, @Body() dto: ManualCheckinDto) {
    return this.checkinService.manualCheckin(
      req.user.id,
      dto.registrationId,
      dto.checkinTypeId,
    );
  }

  @Get('my-events')
  @ApiOperation({ summary: 'Events + points the current user can check in at' })
  async getMyCheckinEvents(@Request() req) {
    return this.checkinService.getMyCheckinEvents(req.user.id);
  }

  @Get('event/:id/search')
  @ApiOperation({ summary: 'Search attendees for manual check-in' })
  async searchRegistrations(
    @Request() req,
    @Param('id') id: string,
    @Query('q') q: string,
    @Query('checkinTypeId') checkinTypeId?: string,
  ) {
    return this.checkinService.searchRegistrations(
      req.user.id,
      id,
      q ?? '',
      checkinTypeId,
    );
  }

  // --- Check-in points ---

  @Get('event/:id/types')
  @ApiOperation({ summary: 'List check-in points for an event' })
  async listCheckinTypes(@Request() req, @Param('id') id: string) {
    return this.checkinService.listCheckinTypes(req.user.id, id);
  }

  @Post('event/:id/types')
  @ApiOperation({ summary: 'Add a check-in point (organiser only)' })
  async createCheckinType(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateCheckinTypeDto,
  ) {
    return this.checkinService.createCheckinType(req.user.id, id, dto.name);
  }

  @Delete('event/:id/types/:typeId')
  @ApiOperation({ summary: 'Delete a check-in point (organiser only)' })
  async deleteCheckinType(
    @Request() req,
    @Param('id') id: string,
    @Param('typeId') typeId: string,
  ) {
    return this.checkinService.deleteCheckinType(req.user.id, id, typeId);
  }

  // --- Access grants (per team member, per point) ---

  @Get('event/:id/access')
  @ApiOperation({ summary: 'Team members + their check-in point grants (organiser only)' })
  async listCheckinAccess(@Request() req, @Param('id') id: string) {
    return this.checkinService.listCheckinAccess(req.user.id, id);
  }

  @Put('event/:id/access/:userId')
  @ApiOperation({ summary: "Replace a team member's check-in grants (organiser only)" })
  async setCheckinAccess(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: SetCheckinAccessDto,
  ) {
    return this.checkinService.setCheckinAccess(
      req.user.id,
      id,
      userId,
      dto.checkinTypeIds,
    );
  }

  @Get('event/:id')
  @ApiOperation({
    summary: 'Get all registrations for offline caching (organiser only)',
  })
  @ApiResponse({ status: 200 })
  async getEventRegistrationsForOffline(
    @Request() req,
    @Param('id') id: string,
  ) {
    return this.checkinService.getEventRegistrationsForOffline(
      req.user.id,
      id,
    );
  }

  @Get('event/:id/roster')
  @ApiOperation({ summary: 'Compact guest list for offline scanning' })
  async getOfflineRoster(@Request() req, @Param('id') id: string) {
    return this.checkinService.getOfflineRoster(req.user.id, id);
  }

  @Get('event/:id/roster/changes')
  @ApiOperation({ summary: 'Guest-list changes since a roster cursor (offline scanners)' })
  async getRosterChanges(
    @Request() req,
    @Param('id') id: string,
    @Query('since') since: string,
  ) {
    return this.checkinService.getRosterChanges(req.user.id, id, since ?? '');
  }

  @Post('event/:id/sync')
  @ApiOperation({ summary: 'Replay check-ins recorded while offline' })
  @ApiResponse({ status: 201 })
  async syncOfflineCheckins(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: SyncOfflineCheckinsDto,
  ) {
    return this.checkinService.syncOfflineCheckins(req.user.id, id, dto.items);
  }

  @Get('event/:id/stats')
  @ApiOperation({ summary: 'Get live check-in stats, optionally per point' })
  @ApiResponse({ status: 200 })
  async getCheckinStats(
    @Request() req,
    @Param('id') id: string,
    @Query('checkinTypeId') checkinTypeId?: string,
  ) {
    return this.checkinService.getCheckinStats(req.user.id, id, checkinTypeId);
  }

  @Post('event/:id/bulk')
  @ApiOperation({ summary: 'Bulk check-in by registration IDs' })
  @ApiResponse({ status: 201 })
  async bulkCheckin(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: BulkCheckinDto,
  ) {
    return this.checkinService.bulkCheckin(
      req.user.id,
      id,
      dto.registrationIds,
    );
  }
}
