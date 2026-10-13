import { timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MAIN_COMMITS_CAP, OTA_CHANNELS, OtaAdminService, type OtaChannel } from './ota-admin.service';

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
 *   GET  /admin/ota/adoption?days=30      -> active users per runtime / update (O13)
 *   GET  /admin/ota/staleness             -> unshipped mobile commits on main + OTA-safe (O12)
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

  @Get('adoption')
  adoption(@Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new BadRequestException('days must be 1-365.');
    return this.ota.adoption(n);
  }

  @Get('staleness')
  staleness() {
    return this.ota.staleness();
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

const SHA_RE = /^[0-9a-f]{40}$/;

class MainCommitDto {
  @Matches(SHA_RE)
  sha: string;

  @IsISO8601()
  date: string;
}

class FingerprintsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ios?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  android?: string;
}

class MainStatusDto {
  @Matches(SHA_RE)
  sha: string;

  @IsBoolean()
  otaSafe: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => FingerprintsDto)
  fingerprints?: FingerprintsDto;

  @IsArray()
  @ArrayMaxSize(MAIN_COMMITS_CAP)
  @ValidateNested({ each: true })
  @Type(() => MainCommitDto)
  commits: MainCommitDto[];
}

/**
 * POST /admin/ota/main-status: CI reports main's OTA status after every push to
 * main that touches mobile/ (ci.yml, "Report OTA status"). No user session: the
 * caller proves itself with the shared secret OTA_STATUS_SECRET.
 */
@Controller('admin/ota')
export class OtaStatusIngestController {
  constructor(private readonly ota: OtaAdminService) {}

  @Post('main-status')
  @HttpCode(204)
  async report(@Headers('x-ota-status-secret') given: string | undefined, @Body() dto: MainStatusDto) {
    assertOtaStatusSecret(given, process.env.OTA_STATUS_SECRET);
    await this.ota.saveMainStatus({ ...dto, reportedAt: new Date().toISOString() });
  }
}

/** Constant-time check of CI's shared secret. Unset on the server = endpoint off. */
export function assertOtaStatusSecret(given: string | undefined, secret: string | undefined): void {
  if (!secret) throw new ServiceUnavailableException('OTA_STATUS_SECRET is not set on the server.');
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
}
