import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import type { AppVersionConfig } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
