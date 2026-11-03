import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { WegobeyondController } from './wegobeyond.controller';
import { WegobeyondService } from './wegobeyond.service';

/** wegobeyond.in content + crew sign-ups, edited in Apex (PrismaModule is @Global). */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [WegobeyondController],
  providers: [WegobeyondService],
})
export class WegobeyondModule {}
