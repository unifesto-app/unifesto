import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebhookDeliveryQueue } from './webhook-delivery.queue';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/** K23: webhooks for a space's own server. Emitters only import webhook-events.ts. */
@Module({
  imports: [AuthModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryQueue],
})
export class WebhooksModule {}
