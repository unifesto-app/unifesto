import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { IsInt, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OTA_CHANNELS, OtaAdminService, type OtaChannel } from './ota-admin.service';

class SetRolloutDto {
  @IsInt()
  @Min(1)
  @Max(100)
  percentage: number;
}

/**
 * Apex › OTA updates (platform admins only).
 *
 *   GET  /admin/ota?channel=production    -> latest update groups
 *   POST /admin/ota/:group/rollout        -> { percentage } for a staged rollout
 *   POST /admin/ota/:group/revert         -> revert a staged rollout
 *   POST /admin/ota/:group/republish      -> make an earlier update the latest (rollback)
 */
@Controller('admin/ota')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class OtaAdminController {
  constructor(private readonly ota: OtaAdminService) {}

  @Get()
  list(@Query('channel') channel = 'production') {
    if (!OTA_CHANNELS.includes(channel as OtaChannel)) throw new BadRequestException('Unknown channel.');
    return this.ota.listGroups(channel as OtaChannel);
  }

  @Post(':group/rollout')
  async setRollout(@Param('group') group: string, @Body() dto: SetRolloutDto, @CurrentUser() user: User) {
    await this.ota.setRollout(group, dto.percentage, user.id);
    return { ok: true };
  }

  @Post(':group/revert')
  async revert(@Param('group') group: string, @CurrentUser() user: User) {
    await this.ota.revertRollout(group, user.id);
    return { ok: true };
  }

  @Post(':group/republish')
  async republish(@Param('group') group: string, @CurrentUser() user: User) {
    await this.ota.republish(group, user.id);
    return { ok: true };
  }
}
