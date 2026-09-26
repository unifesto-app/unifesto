import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';

/**
 * Careers: public job postings + admin CRUD + in-platform applications.
 * PrismaModule is @Global; AuthModule provides the guards for the admin routes
 * (the public list/detail/apply routes are unguarded); StorageModule handles
 * resume uploads to S3.
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [CareersController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
