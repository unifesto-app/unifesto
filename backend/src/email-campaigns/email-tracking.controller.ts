import {
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { EmailCampaignsService } from './email-campaigns.service';

// 1x1 fully-transparent GIF. Served for every open so a broken/absent pixel
// never shows a red X in the recipient's client.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * Public (unauthenticated) email engagement endpoints. These are hit by the
 * recipient's mail client, not by an authenticated operator, so they carry no
 * guard — the log id is an opaque UUID and click targets are HMAC-signed, so
 * neither endpoint can be abused to attribute arbitrary data or open-redirect.
 */
@ApiExcludeController()
@Controller('email/track')
export class EmailTrackingController {
  constructor(private readonly campaigns: EmailCampaignsService) {}

  @Get('open/:logId')
  async open(
    @Param('logId') logId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.campaigns.recordOpen(logId).catch(() => undefined);
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.end(TRANSPARENT_GIF);
  }

  @Get('click/:logId')
  async click(
    @Param('logId') logId: string,
    @Query('u') url: string,
    @Query('s') signature: string,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.campaigns
      .recordClick(logId, url, signature)
      .catch(() => null);
    // Tampered / unsigned links never redirect to the supplied URL — bounce to
    // the app home instead of acting as an open redirect.
    res.redirect(302, target ?? 'https://unifesto.app');
  }
}
