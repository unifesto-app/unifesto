import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { StorageModule } from '../storage/storage.module';

// PrismaService (used by WhatsAppService for the inbox) comes from the @Global
// PrismaModule, so it needs no explicit import here. StorageModule provides the
// S3 uploader used to copy inbound media previews. The admin inbox routes live
// in AdminModule, which already has the JWT/Roles guards wired.
@Module({
  imports: [ConfigModule, StorageModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
