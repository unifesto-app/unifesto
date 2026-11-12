import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

/** K22: registration API keys for a space's own site, and their console management. */
@Module({
  // AuthModule: JwtAuthGuard and CanGuard on the console's key management routes.
  imports: [AuthModule, RegistrationsModule],
  controllers: [PublicApiController, ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, PublicApiService],
  exports: [ApiKeysService],
})
export class PublicApiModule {}
