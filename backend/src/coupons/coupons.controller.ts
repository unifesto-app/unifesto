import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './dto';

@ApiTags('coupons')
@Controller('events/:eventId/coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  // ---- Organiser management (gated as event editing, like ticket types) ----

  @Post()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  create(@Param('eventId') eventId: string, @Body() dto: CreateCouponDto) {
    return this.coupons.create(eventId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  list(@Param('eventId') eventId: string) {
    return this.coupons.listForEvent(eventId);
  }

  @Patch(':couponId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  update(
    @Param('eventId') eventId: string,
    @Param('couponId') couponId: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.coupons.update(eventId, couponId, dto);
  }

  @Delete(':couponId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  remove(
    @Param('eventId') eventId: string,
    @Param('couponId') couponId: string,
  ) {
    return this.coupons.remove(eventId, couponId);
  }

  // ---- Buyer-facing: check a code before paying (any signed-in user) ----

  // J1: per signed-in user (UserAwareThrottlerGuard), so codes can't be guessed
  // at the global 300/min; a real buyer checks one or two.
  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  validate(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: ValidateCouponDto,
  ) {
    return this.coupons.quote(eventId, user.id, {
      code: dto.code,
      ticketTypeId: dto.ticketTypeId,
      quantity: dto.quantity,
      groupSize: dto.groupSize,
    });
  }
}
