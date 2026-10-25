import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { AiModule } from '../ai/ai.module';
import { BlogWriterService } from './blog-writer.service';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

/**
 * Blog: public Markdown posts for the marketing site + admin CRUD.
 * PrismaModule is @Global; AuthModule guards the admin routes (public
 * list/detail are unguarded); StorageModule handles cover-image uploads.
 * BlogWriterService is the auto-blog (queue, writer cron, Search Console learn).
 */
@Module({
  imports: [AuthModule, StorageModule, AiModule],
  controllers: [BlogController],
  providers: [BlogService, BlogWriterService],
  exports: [BlogService],
})
export class BlogModule {}
