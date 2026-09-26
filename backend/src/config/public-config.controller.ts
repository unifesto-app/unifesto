import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformConfigService } from '../subscription/platform-config.service';

/**
 * Public, unauthenticated read of platform settings that clients need in order
 * to render pricing (e.g. the app-wide processing fee shown at checkout).
 */
@ApiTags('Config')
@Controller('config')
export class PublicConfigController {
  constructor(private readonly platformConfig: PlatformConfigService) {}

  @Get('processing-fee')
  @ApiOperation({ summary: 'Get the app-wide processing fee percentage' })
  getProcessingFee() {
    return { processingFeePercent: this.platformConfig.getProcessingFeePercent() };
  }
}
