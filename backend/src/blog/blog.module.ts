import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

/**
 * Blog: public Markdown posts for the marketing site + admin CRUD.
 * PrismaModule is @Global; AuthModule guards the admin routes (public
 * list/detail are unguarded); StorageModule handles cover-image uploads.
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
