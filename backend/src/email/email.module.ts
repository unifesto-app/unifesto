import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailWebhooksController } from './email-webhooks.controller';

@Module({
  imports: [ConfigModule],
  controllers: [EmailWebhooksController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
