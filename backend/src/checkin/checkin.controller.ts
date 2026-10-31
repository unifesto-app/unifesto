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
import { CheckinService } from './checkin.service';
import {
  BulkCheckinDto,
  ScanQRCodeDto,
  ManualCheckinDto,
  CreateCheckinTypeDto,
  SetCheckinAccessDto,
  GroupCheckinDto,
  SyncOfflineCheckinsDto,
  UndoCheckinDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Post('scan')
  async scanQRCode(@Request() req, @Body() dto: ScanQRCodeDto) {
    return this.checkinService.scanQRCode(
      req.user.id,
      dto.qrCode,
      dto.checkinTypeId,
      dto.groupAware ?? false,
    );
  }

  @Post('group')
  async checkinGroupMembers(@Request() req, @Body() dto: GroupCheckinDto) {
    return this.checkinService.checkinGroupMembers(
      req.user.id,
      dto.registrationId,
      dto.checkinTypeId,
      dto.memberIndexes,
    );
  }

  @Post('manual')
  async manualCheckin(@Request() req, @Body() dto: ManualCheckinDto) {
    return this.checkinService.manualCheckin(
      req.user.id,
      dto.registrationId,
      dto.checkinTypeId,
      dto.memberIndex,
    );
  }

  @Post('undo')
  async undoCheckin(@Request() req, @Body() dto: UndoCheckinDto) {
    return this.checkinService.undoCheckin(
      req.user.id,
      dto.registrationId,
      dto.checkinTypeId,
      dto.memberIndex,
      dto.reason,
    );
  }

  @Get('my-events')
  async getMyCheckinEvents(@Request() req) {
    return this.checkinService.getMyCheckinEvents(req.user.id);
  }

  @Get('event/:id/search')
  async searchRegistrations(
    @Request() req,
    @Param('id') id: string,
    @Query('q') q: string,
    @Query('checkinTypeId') checkinTypeId?: string,
    // 4.0.5+ clients: one row per group member instead of per registration.
    @Query('members') members?: string,
  ) {
    return this.checkinService.searchRegistrations(
      req.user.id,
      id,
      q ?? '',
      checkinTypeId,
      members === '1' || members === 'true',
    );
  }

  @Get('event/:id/recent')
  async getRecentCheckins(
    @Request() req,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('checkinTypeId') checkinTypeId?: string,
  ) {
    return this.checkinService.getRecentCheckins(
      req.user.id,
      id,
      Math.min(Math.max(parseInt(limit ?? '', 10) || 10, 1), 50),
      checkinTypeId,
    );
  }

  // --- Check-in points ---

  @Get('event/:id/types')
  async listCheckinTypes(@Request() req, @Param('id') id: string) {
    return this.checkinService.listCheckinTypes(req.user.id, id);
  }

  @Post('event/:id/types')
  async createCheckinType(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateCheckinTypeDto,
  ) {
    return this.checkinService.createCheckinType(req.user.id, id, dto.name);
  }

  @Delete('event/:id/types/:typeId')
  async deleteCheckinType(
    @Request() req,
    @Param('id') id: string,
    @Param('typeId') typeId: string,
  ) {
    return this.checkinService.deleteCheckinType(req.user.id, id, typeId);
  }

  // --- Access grants (per team member, per point) ---

  @Get('event/:id/access')
  async listCheckinAccess(@Request() req, @Param('id') id: string) {
    return this.checkinService.listCheckinAccess(req.user.id, id);
  }

  @Put('event/:id/access/:userId')
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
  async getOfflineRoster(@Request() req, @Param('id') id: string) {
    return this.checkinService.getOfflineRoster(req.user.id, id);
  }

  @Get('event/:id/roster/changes')
  async getRosterChanges(
    @Request() req,
    @Param('id') id: string,
    @Query('since') since: string,
  ) {
    return this.checkinService.getRosterChanges(req.user.id, id, since ?? '');
  }

  @Post('event/:id/sync')
  async syncOfflineCheckins(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: SyncOfflineCheckinsDto,
  ) {
    return this.checkinService.syncOfflineCheckins(req.user.id, id, dto.items);
  }

  @Get('event/:id/stats')
  async getCheckinStats(
    @Request() req,
    @Param('id') id: string,
    @Query('checkinTypeId') checkinTypeId?: string,
  ) {
    return this.checkinService.getCheckinStats(req.user.id, id, checkinTypeId);
  }

  @Post('event/:id/bulk')
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
