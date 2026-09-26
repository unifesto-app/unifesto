import {
  Controller,
  Get,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LogsService } from './logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode } from '@prisma/client';

@ApiTags('Admin Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
@Controller('admin/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @ApiOperation({ summary: 'Query API request logs (admin only)' })
  async getLogs(
    @Query('method') method?: string,
    @Query('status')
    status?: 'success' | 'client_error' | 'server_error' | 'error',
    @Query('search') search?: string,
    @Query('userId') userId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.logsService.query({
      method,
      status,
      search,
      userId,
      page,
      limit,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'API log summary (admin only)' })
  async getStats() {
    return this.logsService.getStats();
  }
}
