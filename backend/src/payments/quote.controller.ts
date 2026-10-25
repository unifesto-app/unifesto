import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { TermsService } from '../subscription/terms.service';
import { quote } from './quote';

export class QuoteDto {
  @ApiPropertyOptional({
    description: 'Event the sale is for (sets the space, deal and absorb rule)',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Session the sale is for, instead of an event',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiProperty({
    example: 50000,
    description: 'Ticket price × units, in paise, before any coupon',
  })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  basePaise: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Priced units for the per-ticket fee cap',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  tickets?: number;

  @ApiPropertyOptional({
    description: 'Discount from the coupon quote endpoint, in paise',
  })
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
@ApiTags('Payments')
@Controller('quote')
export class QuoteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terms: TermsService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Price a sale: base, buyer fee and total in paise' })
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
