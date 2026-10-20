import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { IsEmail, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, CurrentUser } from '../auth/decorators';
import { Action, Can, CanGuard } from '../auth/authorization';
import { OrbitService } from './orbit.service';

class AppointOrbitLeadDto {
  @IsUUID() spaceId!: string;
  @IsEmail() email!: string;
}

class EndOrbitLeadDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

class ExamPauseDto {
  /** ISO date the pause runs until; null clears it. */
  @IsOptional() @IsISO8601() until?: string | null;
}

@ApiTags('orbit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orbit')
export class OrbitController {
  constructor(private readonly orbit: OrbitService) {}

  /** Every campus ranked (Apex). */
  @Get('admin/leaderboard')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async leaderboard() {
    return { campuses: await this.orbit.campuses() };
  }

  @Post('admin/leads')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  appoint(@Body() dto: AppointOrbitLeadDto, @CurrentUser() user: User) {
    return this.orbit.appoint(dto.spaceId, dto.email, user.id);
  }

  @Patch('admin/leads/:id/end')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  end(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EndOrbitLeadDto, @CurrentUser() user: User) {
    return this.orbit.end(id, dto.reason, user.id);
  }

  @Patch('admin/leads/:id/exam-pause')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  examPause(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExamPauseDto) {
    return this.orbit.setExamPause(id, dto.until ? new Date(dto.until) : null);
  }

  /** The Orbit Lead's view of their own campus (space app), no money. */
  @Get('space/:id')
  @UseGuards(CanGuard)
  @Can(Action.SPACE_MANAGE_MEMBERS)
  forCampus(@Param('id', ParseUUIDPipe) id: string) {
    return this.orbit.forCampus(id);
  }
}
