import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { IsBoolean, IsIn } from 'class-validator';
import { Action, Can, CanGuard } from '../auth/authorization';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AUTOMATIONS } from './automations';
import { AutomationsService } from './automations.service';

export class SetAutomationDto {
  @IsIn(AUTOMATIONS.filter((a) => a.switchable).map((a) => a.key))
  key!: string;

  @IsBoolean()
  on!: boolean;
}

/** Apex › Automations: every automatic message with its channels and counts (C18). */
@Controller('admin/automations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminAutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  list(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.automations.list(days);
  }
}

/** An event's automatic messages: its managers switch the optional ones off for it alone. */
@Controller('events/:eventId/automations')
@UseGuards(JwtAuthGuard, CanGuard)
export class EventAutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  forEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.automations.forEvent(eventId);
  }

  @Patch()
  @Can(Action.EVENT_EDIT, { eventKey: 'eventId' })
  set(@Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: SetAutomationDto) {
    return this.automations.setForEvent(eventId, dto.key, dto.on);
  }
}
