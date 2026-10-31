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
import { StatusService } from './status.service';
import { UptimeRobotService } from './uptime-robot.service';
import { SentryIssuesService } from './sentry-issues.service';
import { CreateIncidentDto, UpdateIncidentDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../audit/audit';
import { RoleCode } from '@prisma/client';

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
  getSummary() {
    return this.statusService.getSummary();
  }

  @Get('external')
  getExternal() {
    return this.uptimeRobot.getStatus();
  }

  @Get('errors')
  getErrors() {
    return this.sentry.getIssues();
  }

  // Sentry credits the integration, not the person, so audit_logs keeps who clicked.
  @Post('errors/:id/resolve')
  @Audit('sentry.issue.resolve')
  resolveError(@Param('id') id: string) {
    return this.sentry.resolve(id);
  }

  @Get('incidents')
  listIncidents() {
    return this.statusService.listIncidents();
  }

  @Post('incidents')
  createIncident(@Body() dto: CreateIncidentDto, @Req() req: any) {
    return this.statusService.createIncident(dto, req.user.id);
  }

  @Patch('incidents/:id')
  updateIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.statusService.updateIncident(id, dto);
  }
}
