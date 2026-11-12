import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { User } from '@prisma/client';
import { Action } from '../auth/authorization/actions';
import { Can } from '../auth/authorization/can.decorator';
import { CanGuard } from '../auth/authorization/can.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Audit } from '../audit/audit';
import { WEBHOOK_TYPES } from './webhook-delivery.util';
import { WebhooksService } from './webhooks.service';

class CreateWebhookDto {
  @IsString()
  @MaxLength(500)
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WEBHOOK_TYPES.length)
  @IsIn(WEBHOOK_TYPES, { each: true })
  events: string[];
}

class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WEBHOOK_TYPES.length)
  @IsIn(WEBHOOK_TYPES, { each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** K23: Space Admins manage their space's webhooks (console › Settings › API). */
@UseGuards(JwtAuthGuard, CanGuard)
@Controller('spaces/:spaceId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  list(@Param('spaceId', ParseUUIDPipe) spaceId: string) {
    return this.webhooks.list(spaceId);
  }

  /** The signing secret is in this response only; the audit row keeps the URL and events. */
  @Post()
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Audit('space.webhook.create', (r) => ({ spaceId: r.params.spaceId }))
  create(@Param('spaceId', ParseUUIDPipe) spaceId: string, @CurrentUser() user: User, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(spaceId, user.id, dto);
  }

  @Patch(':id')
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  @Audit('space.webhook.update', (r) => ({ spaceId: r.params.spaceId }))
  update(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhooks.update(spaceId, id, dto);
  }

  @Delete(':id')
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  @Audit('space.webhook.delete', (r) => ({ spaceId: r.params.spaceId }))
  remove(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.remove(spaceId, id);
  }

  @Get(':id/deliveries')
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  deliveries(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.deliveries(spaceId, id);
  }

  /** Outbound calls on a click: kept to a few a minute. */
  @Post(':id/test')
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sendTest(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.sendTest(spaceId, id);
  }

  @Post(':id/deliveries/:deliveryId/resend')
  @Can(Action.SPACE_MANAGE_INTEGRATIONS)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resend(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.webhooks.resend(spaceId, id, deliveryId);
  }
}
