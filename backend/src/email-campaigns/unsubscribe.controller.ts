import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { esc, h1, layout, p, small } from '../email/layout';
import { EmailCampaignsService } from './email-campaigns.service';

// The page loads the logo and fonts from other origins and posts back to
// itself; the app-wide CSP (default-src 'self') would block the images.
const PAGE_CSP =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https:; form-action 'self'; frame-ancestors 'none'";

const submit = (label: string, scope?: 'all') =>
  `<form method="post" style="margin:0 0 12px;">${
    scope ? `<input type="hidden" name="scope" value="${scope}">` : ''
  }<button type="submit" class="b-btn c-btnText" style="font:inherit;font-size:15px;font-weight:600;padding:12px 24px;border-radius:999px;border:0;background:#111113;color:#ffffff;cursor:pointer;">${esc(label)}</button></form>`;

/**
 * Public unsubscribe for campaign mail. The token in `t` is an HMAC of the
 * recipient's email and the sending space, so it can only opt out the address
 * it was issued to.
 *
 *   GET  /email/unsubscribe?t=  -> a confirm page (link scanners prefetch GETs,
 *                                  so a GET never unsubscribes on its own)
 *   POST /email/unsubscribe?t=  -> unsubscribe. Gmail/Yahoo one-click
 *                                  (List-Unsubscribe-Post) and the page's form
 *                                  both land here; `scope=all` widens a space
 *                                  link to all marketing mail.
 */
@Controller('email/unsubscribe')
export class UnsubscribeController {
  constructor(private readonly campaigns: EmailCampaignsService) {}

  @Get()
  async page(@Query('t') token: string, @Res() res: Response): Promise<void> {
    const claim = await this.campaigns.readUnsubscribeToken(token);
    if (!claim) return this.send(res, 400, invalid);
    const body = claim.spaceId
      ? h1('Unsubscribe') +
        p(`Stop marketing email to ${esc(claim.email)} from ${esc(claim.spaceName ?? 'this space')}, or from everyone on Unifesto.`) +
        submit(`Only ${claim.spaceName ?? 'this space'}`) +
        submit('All marketing email', 'all')
      : h1('Unsubscribe') +
        p(`Stop marketing email from Unifesto to ${esc(claim.email)}.`) +
        submit('Unsubscribe');
    this.send(
      res,
      200,
      body + small('You will still get tickets, receipts and sign-in codes.'),
    );
  }

  @Post()
  @HttpCode(200)
  async unsubscribe(
    @Query('t') token: string,
    @Body() body: Record<string, string> | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const ok = await this.campaigns.unsubscribe(token, {
      everything: body?.scope === 'all',
      source: body?.['List-Unsubscribe'] === 'One-Click' ? 'one_click' : 'link',
    });
    if (!ok) return this.send(res, 400, invalid);
    this.send(
      res,
      200,
      h1('You are unsubscribed') +
        p('You will not get these marketing emails any more. Tickets, receipts and sign-in codes still come through.'),
    );
  }

  private send(res: Response, status: number, body: string): void {
    res
      .status(status)
      .set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP })
      .send(layout(body));
  }
}

const invalid =
  h1('This link does not work') +
  p('It may have been cut off. Open it again from the email, or write to support@unifesto.app and we will unsubscribe you.');
