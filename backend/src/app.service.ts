import { Injectable } from '@nestjs/common';
import {
  PlatformConfigService,
  AppVersionConfig,
} from './subscription/platform-config.service';

export type { AppVersionConfig, PlatformVersionInfo } from './subscription/platform-config.service';

@Injectable()
export class AppService {
  constructor(private readonly platformConfig: PlatformConfigService) {}

  getHello(): string {
    return '© 2026 Unifesto Private Limited. All rights reserved.';
  }

  /**
   * Version policy driving the mobile "update available" prompt. Admin-managed
   * and stored on the platform_config row (see PlatformConfigService); served
   * from its in-memory cache.
   */
  getAppVersion(): AppVersionConfig {
    return this.platformConfig.getAppVersion();
  }
}
