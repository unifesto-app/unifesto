import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard, type ApiKeyRequest } from './api-key.guard';
import { ApiRegisterDto } from './dto';
import { PublicApiService } from './public-api.service';

/**
 * K22: the registration API for a space's own site, on an API key
 * (`Authorization: Bearer uf_live_…`), server to server only. The global IP
 * throttle still applies (it also caps guessing at keys); each key has its
 * own per-minute and daily limits on top (ApiKeyGuard, PublicApiService).
 */
@Controller('v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly api: PublicApiService) {}

  @Get('events')
  listEvents(@Req() req: ApiKeyRequest) {
    return this.api.listEvents(req.apiKey.spaceId);
  }

  @Get('events/:event')
  getEvent(@Req() req: ApiKeyRequest, @Param('event') event: string) {
    return this.api.getEvent(req.apiKey.spaceId, event);
  }

  @Post('events/:event/registrations')
  @HttpCode(201)
  register(
    @Req() req: ApiKeyRequest,
    @Param('event') event: string,
    @Body() dto: ApiRegisterDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.api.register(req.apiKey, event, dto, idempotencyKey);
  }

  @Get('registrations/:id')
  getRegistration(@Req() req: ApiKeyRequest, @Param('id') id: string) {
    return this.api.getRegistration(req.apiKey.spaceId, id);
  }
}
