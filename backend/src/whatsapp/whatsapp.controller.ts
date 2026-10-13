import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WhatsAppService } from './whatsapp.service';

/**
 * Handles Meta/WhatsApp Cloud API webhooks.
 *
 *   GET  /messages/webhook  -> subscription verification handshake
 *   POST /messages/webhook  -> inbound messages & status callbacks
 */
@Controller('messages')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Meta calls this once when the webhook is configured. We must echo back the
   * `hub.challenge` value as plain text (200) when the verify token matches.
   */
  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const result = this.whatsappService.verifyWebhookChallenge(
      mode,
      token,
      challenge,
    );

    if (result === null) {
      res.status(403).send('Forbidden');
      return;
    }

    res.status(200).send(result);
  }

  /**
   * Inbound webhook events. Verify the signature against the raw body, then
   * process asynchronously and always return 200 quickly so Meta does not retry.
   */
  @Post('webhook')
  @HttpCode(200)
  receive(
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ): { received: boolean } {
    const rawBody = req.rawBody?.toString('utf8') ?? '';

    if (!signature || !rawBody) {
      throw new BadRequestException('Missing signature or body');
    }

    const valid = this.whatsappService.verifyWebhookSignature(
      signature,
      rawBody,
    );

    if (!valid) {
      this.logger.warn('Rejected WhatsApp webhook with invalid signature');
      throw new BadRequestException('Invalid signature');
    }

    // Fire-and-forget: Meta needs a fast 200, and persistence is self-contained
    // (every branch is wrapped) so a failure here never breaks the ack.
    void this.whatsappService.handleWebhookPayload(req.body).catch((err) =>
      this.logger.error(`handleWebhookPayload failed: ${err instanceof Error ? err.message : String(err)}`),
    );

    return { received: true };
  }
}
