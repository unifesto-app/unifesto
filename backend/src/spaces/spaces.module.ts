import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { EmailModule } from '../email/email.module';
import { RolesGuard } from '../auth/guards';
import { BannerPaletteModule } from '../banner-palette/banner-palette.module';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, StorageModule, EmailModule, BannerPaletteModule],
  controllers: [SpacesController],
  providers: [SpacesService, RolesGuard],
  exports: [SpacesService],
})
export class SpacesModule {}
