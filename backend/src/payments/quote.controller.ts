import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { TermsService } from '../subscription/terms.service';
import { quote } from './quote';

export class QuoteDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  basePaise: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  tickets?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  couponDiscountPaise?: number;
}

/**
 * What a buyer will pay (T5), from the same quote() and terms checkout uses,
 * so web and mobile stop estimating 5% themselves. Display only: checkout
 * re-prices on the server, so a stale or tampered quote charges nothing.
 */
@Controller('quote')
export class QuoteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terms: TermsService,
  ) {}

  @Post()
  @HttpCode(200)
  async quote(@Body() dto: QuoteDto) {
    if (!dto.eventId === !dto.sessionId) {
      throw new BadRequestException('Pass an eventId or a sessionId');
    }
    let spaceId: string;
    let absorb = false;
    if (dto.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: dto.eventId },
        select: { spaceId: true, absorbProcessingFee: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      spaceId = event.spaceId;
      absorb = event.absorbProcessingFee;
    } else {
      const session = await this.prisma.session.findUnique({
        where: { id: dto.sessionId },
        select: { spaceId: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      spaceId = session.spaceId;
    }
    const terms = await this.terms.resolve(spaceId, dto.eventId);
    const q = quote(dto.basePaise, terms, {
      tickets: dto.tickets,
      absorb,
      couponDiscountPaise: dto.couponDiscountPaise,
    });
    return {
      basePaise: q.basePaise,
      couponDiscountPaise: q.couponDiscountPaise,
      buyerFeePaise: q.buyerFeePaise,
      totalPaise: q.totalPaise,
      buyerFeeBps: terms.buyerFeeBps,
      buyerFeeCapPaise: terms.buyerFeeCapPaise,
      feeAbsorbed: absorb,
    };
  }
}
