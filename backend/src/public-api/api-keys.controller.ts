import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { User } from '@prisma/client';
import { Action } from '../auth/authorization/actions';
import { Can } from '../auth/authorization/can.decorator';
import { CanGuard } from '../auth/authorization/can.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Audit } from '../audit/audit';
import { ApiKeysService } from './api-keys.service';

class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;
}

/** K22: Space Admins manage their space's registration API keys (console › Settings › API). */
@UseGuards(JwtAuthGuard, CanGuard)
@Controller('spaces/:spaceId/api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  list(@Param('spaceId', ParseUUIDPipe) spaceId: string) {
    return this.keys.list(spaceId);
  }

  /** The key is in this response only. The audit row keeps the name, never the key. */
  @Post()
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Audit('space.api_key.create', (r) => ({ spaceId: r.params.spaceId }))
  create(@Param('spaceId', ParseUUIDPipe) spaceId: string, @CurrentUser() user: User, @Body() dto: CreateApiKeyDto) {
    return this.keys.create(spaceId, user.id, dto.name);
  }

  @Delete(':keyId')
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  @Audit('space.api_key.revoke', (r) => ({ spaceId: r.params.spaceId }))
  revoke(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Param('keyId', ParseUUIDPipe) keyId: string) {
    return this.keys.revoke(spaceId, keyId);
  }
}
