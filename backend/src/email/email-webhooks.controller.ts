import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyEmailEvent,
  isSnsUrl,
  resendEvent,
  sesEvent,
  SnsMessage,
  verifySnsSignature,
  verifySvixSignature,
} from './email-webhooks';

/**
 * C5 email delivery webhooks (public, signature-verified):
 *   POST /webhooks/ses     SNS -> SES Delivery / Bounce / Complaint (/ Open)
 *   POST /webhooks/resend  Resend (Svix-signed) delivered / bounced / complained / opened
 */
@Controller('webhooks')
@SkipThrottle()
export class EmailWebhooksController {
  private readonly logger = new Logger(EmailWebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('ses')
  @HttpCode(200)
  async ses(@Req() req: Request & { rawBody?: Buffer }): Promise<{ ok: true }> {
    // SNS can sign anything from any AWS account; only our own topics count.
    const topics = (this.config.get<string>('SES_SNS_TOPIC_ARNS') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!topics.length) {
      this.logger.error('SES webhook hit but SES_SNS_TOPIC_ARNS is not set');
      throw new ServiceUnavailableException('Not configured');
    }

    let m: SnsMessage;
    try {
      // SNS posts JSON as text/plain.
      m = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      throw new BadRequestException('Invalid JSON');
    }
    if (!m?.Type || !topics.includes(m.TopicArn)) throw new ForbiddenException('Unknown topic');
    if (!(await verifySnsSignature(m))) {
      this.logger.warn(`Rejected SNS message ${m.MessageId}: bad signature`);
      throw new ForbiddenException('Invalid signature');
    }

    if (m.Type === 'SubscriptionConfirmation') {
      if (!isSnsUrl(m.SubscribeURL)) throw new BadRequestException('Bad SubscribeURL');
      const res = await fetch(m.SubscribeURL!, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      this.logger.log(`SNS subscription to ${m.TopicArn} confirmed (${res.status})`);
      return { ok: true };
    }
    if (m.Type !== 'Notification') return { ok: true };

    let n: unknown;
    try {
      n = JSON.parse(m.Message);
    } catch {
      return { ok: true }; // e.g. the plain-text "test" notification
    }
    const ev = sesEvent(n);
    if (ev) await applyEmailEvent(this.prisma, 'ses', ev);
    return { ok: true };
  }

  @Post('resend')
  @HttpCode(200)
  async resend(
    @Headers('svix-id') id: string,
    @Headers('svix-timestamp') timestamp: string,
    @Headers('svix-signature') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<{ ok: true }> {
    const secret = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('Resend webhook hit but RESEND_WEBHOOK_SECRET is not set');
      throw new ServiceUnavailableException('Not configured');
    }
    const raw = req.rawBody?.toString('utf8') ?? '';
    if (!verifySvixSignature(secret, { id, timestamp, signature }, raw)) {
      this.logger.warn(`Rejected Resend webhook ${id}: bad signature`);
      throw new ForbiddenException('Invalid signature');
    }
    const ev = resendEvent(req.body);
    if (ev) await applyEmailEvent(this.prisma, 'resend', ev);
    return { ok: true };
  }
}
