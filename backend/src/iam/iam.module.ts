import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IamController } from './iam.controller';

/**
 * IAM console surface (apex.unifesto.app). Thin: the matrix logic lives in
 * CapabilityConfigService, which AuthModule already owns and exports, so this
 * module only wires the controller. Importing AuthModule also brings in the
 * JwtAuthGuard + CanGuard the routes use.
 */
@Module({
  imports: [AuthModule],
  controllers: [IamController],
})
export class IamModule {}
