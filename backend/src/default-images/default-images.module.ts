import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { DefaultImagesController } from './default-images.controller';
import { DefaultImagesService } from './default-images.service';

/** Stand-in banners/logos managed in Apex (PrismaModule is @Global). */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [DefaultImagesController],
  providers: [DefaultImagesService],
})
export class DefaultImagesModule {}
