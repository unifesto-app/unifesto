import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StatusService } from './status.service';
import { UptimeRobotService } from './uptime-robot.service';
import { SentryIssuesService } from './sentry-issues.service';
import { CreateIncidentDto, UpdateIncidentDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode } from '@prisma/client';

@ApiTags('Status')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
@Controller('admin/status')
export class StatusController {
  constructor(
    private readonly statusService: StatusService,
    private readonly uptimeRobot: UptimeRobotService,
    private readonly sentry: SentryIssuesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Uptime history + incidents (admin)' })
  getSummary() {
    return this.statusService.getSummary();
  }

  @Get('external')
  @ApiOperation({ summary: 'External monitors from UptimeRobot (admin)' })
  getExternal() {
    return this.uptimeRobot.getStatus();
  }

  @Get('errors')
  @ApiOperation({ summary: 'Unresolved Sentry issues from the last 24h (admin)' })
  getErrors() {
    return this.sentry.getIssues();
  }

  @Get('incidents')
  @ApiOperation({ summary: 'List incidents (admin)' })
  listIncidents() {
    return this.statusService.listIncidents();
  }

  @Post('incidents')
  @ApiOperation({ summary: 'Report an incident (admin)' })
  createIncident(@Body() dto: CreateIncidentDto, @Req() req: any) {
    return this.statusService.createIncident(dto, req.user.id);
  }

  @Patch('incidents/:id')
  @ApiOperation({ summary: 'Update / resolve an incident (admin)' })
  updateIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.statusService.updateIncident(id, dto);
  }
}
