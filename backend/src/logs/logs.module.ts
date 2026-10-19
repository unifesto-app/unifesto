import { Module } from '@nestjs/common';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { RetentionService } from './retention.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';

// The request-logging middleware is registered globally in main.ts (so it runs
// for every request, including 401s / 404s). This module owns the service +
// admin query endpoint.
@Module({
  imports: [PrismaModule, AuthModule, StorageModule],
  controllers: [LogsController],
  providers: [LogsService, RetentionService],
  exports: [LogsService],
})
export class LogsModule {}
