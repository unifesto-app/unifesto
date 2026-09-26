import { Module } from '@nestjs/common';
import { ConfigValidationService } from './config-validation.service';
import { PublicConfigController } from './public-config.controller';

@Module({
  controllers: [PublicConfigController],
  providers: [ConfigValidationService],
  exports: [ConfigValidationService],
})
export class ConfigModule {}
