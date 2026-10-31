import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import type { AppVersionConfig } from './app.service';

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
  getAppVersion(): AppVersionConfig {
    return this.appService.getAppVersion();
  }
}
