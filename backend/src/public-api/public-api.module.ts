import { Module } from '@nestjs/common';
import { RegistrationsModule } from '../registrations/registrations.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

/** K22: registration API keys for a space's own site, and their console management. */
@Module({
  imports: [RegistrationsModule],
  controllers: [PublicApiController, ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, PublicApiService],
  exports: [ApiKeysService],
})
export class PublicApiModule {}
