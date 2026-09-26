import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { Can, CanGuard, Action } from '../auth/authorization';
import { FreeAttendeeAddService } from './free-attendee-add.service';
import { CreateFreeAddRequestDto, ReviewFreeAddRequestDto } from './dto';

@Controller('free-attendee-add')
export class FreeAttendeeAddController {
  constructor(private readonly service: FreeAttendeeAddService) {}

  /**
   * Organiser raises a request to add attendees for free on one event. Gated by
   * the same capability as adding attendees; eventId is read from the body.
   */
  @Post('requests')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_MANAGE_ATTENDEES, { source: 'body', eventKey: 'eventId' })
  async createRequest(
    @CurrentUser() user: User,
    @Body() dto: CreateFreeAddRequestDto,
  ) {
    return this.service.createRequest(user.id, dto);
  }

  /** The requests this organiser has raised (optionally one event). */
  @Get('requests/my')
  @UseGuards(JwtAuthGuard)
  async myRequests(
    @CurrentUser() user: User,
    @Query('eventId') eventId?: string,
  ) {
    return this.service.getMyRequests(user.id, eventId);
  }

  /**
   * Platform-admin inbox. Declared before ':id' routes so "requests" isn't
   * captured as an id.
   */
  @Get('requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async allRequests(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getAllRequests(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** Platform admin approves or rejects a request. */
  @Patch('requests/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async review(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: ReviewFreeAddRequestDto,
  ) {
    return this.service.reviewRequest(id, user.id, dto);
  }
}
