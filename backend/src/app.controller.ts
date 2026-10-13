import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import type { AppVersionConfig } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Docker healthcheck + Caddy active probe. Never throttled, so a Redis
  // outage can't fail the probe and eject every replica together.
  @SkipThrottle()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('app/version')
  @ApiOperation({
    summary:
      'Latest & minimum supported app version per platform (drives the in-app update prompt)',
  })
  getAppVersion(): AppVersionConfig {
    return this.appService.getAppVersion();
  }
}
