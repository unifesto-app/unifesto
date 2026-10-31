import { Body, Controller, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SupportMessageSide, SupportTicketStatus } from '@prisma/client';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SupportBot } from './support-bot';
import { findOrCreateUserByEmail } from '../auth/collaborator-invite';

export class GuestStartDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class GuestTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class GuestMessageDto extends GuestTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}

/** A guest's key to their own bot chat: HMAC of the case id, so nothing is stored. */
export function guestToken(ticketId: string): string {
  return crypto.createHmac('sha256', `${process.env.JWT_SECRET}:assist-guest`).update(ticketId).digest('base64url');
}

function tokenOk(ticketId: string, token: string): boolean {
  const want = Buffer.from(guestToken(ticketId));
  const got = Buffer.from(token ?? '');
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/**
 * The account behind a guest's email: the shared invite helper (E1), so
 * signing in later with that email links up. Never renames an existing
 * account: a guest is not verified.
 */
export function findOrCreateGuest(prisma: PrismaService, email: string, name?: string): Promise<string> {
  return findOrCreateUserByEmail(prisma, email, name);
}

/**
 * D11: unifesto.app/help/contact for people who aren't signed in. The guest
 * talks to the Assist bot with public tools only (help articles, event FAQ);
 * "Talk to a person" or no answer opens the case for the desk, and replies go
 * to the email. The token reads only the guest's and the bot's messages, so
 * someone who typed another person's email never reads the desk's replies.
 */
@Controller('support/guest')
export class SupportGuestController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: SupportBot,
  ) {}

  @Post('assist')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async start(@Body() dto: GuestStartDto) {
    const userId = await findOrCreateGuest(this.prisma, dto.email, dto.name);
    const id = await this.bot.start(
      userId,
      { message: dto.message, eventId: dto.eventId, contactEmail: dto.email.trim().toLowerCase() },
      { guest: true },
    );
    return { ...(await this.thread(id)), token: guestToken(id) };
  }

  @Post('assist/:id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async say(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuestMessageDto) {
    const userId = await this.guestCase(id, dto.token);
    await this.bot.say(id, userId, dto.body, { guest: true });
    return this.thread(id);
  }

  @Post('assist/:id/handoff')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async handoff(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuestTokenDto) {
    const userId = await this.guestCase(id, dto.token);
    await this.bot.handoff(id, userId);
    return this.thread(id);
  }

  /** Reload the chat after a refresh: the guest's and the bot's messages only. */
  @Post('assist/:id/thread')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async read(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuestTokenDto) {
    if (!tokenOk(id, dto.token)) throw new NotFoundException('Chat not found');
    return this.thread(id);
  }

  private async guestCase(id: string, token: string): Promise<string> {
    if (!tokenOk(id, token)) throw new NotFoundException('Chat not found');
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, select: { requesterId: true } });
    if (!t) throw new NotFoundException('Chat not found');
    return t.requesterId;
  }

  /** The guest's chat with the bot, its status and where replies go. */
  private async thread(id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        contactEmail: true,
        messages: {
          // Never desk replies or action lines (they go by email and to the account): only the guest and the bot.
          where: { internal: false, side: { in: [SupportMessageSide.REQUESTER, SupportMessageSide.ASSISTANT] } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, side: true, body: true, createdAt: true },
        },
      },
    });
    if (!t) throw new NotFoundException('Chat not found');
    return { ...t, withBot: t.status === SupportTicketStatus.BOT };
  }
}
