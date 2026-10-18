import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HelpController } from './help.controller';
import { HelpService } from './help.service';

/**
 * Help articles (D17): public Markdown help pages at unifesto.app/help and
 * the knowledge base the Assist bot (D14) reads. Admin CRUD is platform-admin
 * only. Exports HelpService so the bot can read articles in-process.
 */
@Module({
  imports: [AuthModule],
  controllers: [HelpController],
  providers: [HelpService],
  exports: [HelpService],
})
export class HelpModule {}
