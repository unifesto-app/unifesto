import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { EmailSuppressionReason, MessageChannel, MessageDeliveryStatus, Prisma, RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { suppressAddress } from '../email/email-suppression';

const STATUSES = Object.values(MessageDeliveryStatus).join('|');

export class MessagesQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @MaxLength(320) recipient?: string;
  @IsOptional() @IsEnum(MessageChannel) channel?: MessageChannel;
  /** One status or a comma list, e.g. FAILED,SUPPRESSED. */
  @IsOptional() @Matches(new RegExp(`^(${STATUSES})(,(${STATUSES}))*$`)) status?: string;
  @IsOptional() @IsString() @MaxLength(64) kind?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  /** Id of the last row of the previous page. */
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class SuppressionsQueryDto {
  @IsOptional() @IsString() @MaxLength(320) search?: string;
  @IsOptional() @IsUUID() cursor?: string;
}

export class AddSuppressionDto {
  @IsEmail() @MaxLength(320) address: string;
  @IsOptional() @IsString() @MaxLength(500) details?: string;
}

class StatsQueryDto {
  @IsOptional() @Type(() => Number) @IsIn([1, 7, 30, 90]) days?: number;
}

const PAGE = 50;
const SEARCH_WINDOW_MS = 30 * 86_400_000;

/**
 * C6 message history + failure dashboard (platform admins only).
 *   GET    /admin/messages               delivery log, filterable, cursor-paged
 *   GET    /admin/messages/stats         channel x status counts, top failures
 *   GET    /admin/email-suppressions     suppression list
 *   POST   /admin/email-suppressions     add one by hand (MANUAL)
 *   DELETE /admin/email-suppressions/:id remove one (mail resumes)
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class MessagesAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('messages')
  async list(@Query() q: MessagesQueryDto) {
    const and: Prisma.MessageDeliveryWhereInput[] = [];
    if (q.userId) and.push({ OR: await this.userMatch(q.userId) });
    if (q.recipient) and.push({ recipient: { contains: q.recipient.trim(), mode: 'insensitive' } });
    // A substring scan can't use an index: bound it to 30 days unless dated.
    const from = q.from ?? (q.recipient && !q.to ? new Date(Date.now() - SEARCH_WINDOW_MS).toISOString() : undefined);
    if (q.channel) and.push({ channel: q.channel });
    if (q.status) and.push({ status: { in: q.status.split(',') as MessageDeliveryStatus[] } });
    if (q.kind) and.push({ kind: q.kind });
    if (from || q.to) {
      and.push({ createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } });
    }
    const take = q.limit ?? PAGE;
    const rows = await this.prisma.messageDelivery.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const more = rows.length > take;
    const items = more ? rows.slice(0, take) : rows;
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  }

  /**
   * A user's messages: rows tagged with their id, plus rows logged by address
   * only (sends without a userId) to any of their emails or their phone.
   */
  private async userMatch(userId: string): Promise<Prisma.MessageDeliveryWhereInput[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mobileNumber: true, identities: { select: { email: true } } },
    });
    const or: Prisma.MessageDeliveryWhereInput[] = [{ userId }, { channel: MessageChannel.PUSH, recipient: userId }];
    // Exact `in` (as stored and lowercased) so the (recipient, created_at) index is used.
    const emails = [...new Set((user?.identities ?? []).flatMap((i) => (i.email ? [i.email, i.email.toLowerCase()] : [])))];
    if (emails.length) or.push({ channel: MessageChannel.EMAIL, recipient: { in: emails } });
    const phones = phoneForms(user?.mobileNumber);
    if (phones.length) or.push({ channel: MessageChannel.WHATSAPP, recipient: { in: phones } });
    return or;
  }

  @Get('messages/stats')
  async stats(@Query() q: StatsQueryDto) {
    const days = q.days ?? 7;
    const since = new Date(Date.now() - days * 86_400_000);
    const failed = { createdAt: { gte: since }, status: MessageDeliveryStatus.FAILED };
    const [byChannel, topKinds, topErrors, suppressions] = await Promise.all([
      this.prisma.messageDelivery.groupBy({
        by: ['channel', 'status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.messageDelivery.groupBy({
        by: ['kind'],
        where: failed,
        _count: { _all: true },
        orderBy: { _count: { kind: 'desc' } },
        take: 5,
      }),
      this.prisma.messageDelivery.groupBy({
        by: ['error'],
        where: failed,
        _count: { _all: true },
        orderBy: { _count: { error: 'desc' } },
        take: 5,
      }),
      this.prisma.emailSuppression.count(),
    ]);
    return {
      days,
      counts: byChannel.map((r) => ({ channel: r.channel, status: r.status, count: r._count._all })),
      topFailingKinds: topKinds.map((r) => ({ kind: r.kind, count: r._count._all })),
      topErrors: topErrors.map((r) => ({ error: r.error, count: r._count._all })),
      suppressions,
    };
  }

  @Get('email-suppressions')
  async suppressions(@Query() q: SuppressionsQueryDto) {
    const rows = await this.prisma.emailSuppression.findMany({
      where: q.search ? { address: { contains: q.search.trim().toLowerCase() } } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const more = rows.length > PAGE;
    const items = more ? rows.slice(0, PAGE) : rows;
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  }

  @Post('email-suppressions')
  add(@Body() dto: AddSuppressionDto) {
    return suppressAddress(this.prisma, dto.address, EmailSuppressionReason.MANUAL, 'admin', dto.details);
  }

  @Delete('email-suppressions/:id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.prisma.emailSuppression.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Not on the suppression list');
    return { removed: true };
  }
}

/** The ways a stored mobile number can appear as a WhatsApp recipient. */
export function phoneForms(mobile: string | null | undefined): string[] {
  if (!mobile) return [];
  const digits = mobile.replace(/\D/g, '');
  if (!digits) return [];
  const forms = new Set([mobile, `+${digits}`, digits]);
  if (digits.length === 10) forms.add(`+91${digits}`);
  return [...forms];
}
