import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { Equals, IsBoolean, IsEmail, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, CurrentUser } from '../auth/decorators';
import { Action, Can, CanGuard } from '../auth/authorization';
import { OrbitService } from './orbit.service';

class AppointOrbitLeadDto {
  @IsUUID() spaceId!: string;
  @IsEmail() email!: string;
  /** LEAD (default) or CREW. */
  @IsOptional() @IsIn(['LEAD', 'CREW']) role?: 'LEAD' | 'CREW';
}

class EndOrbitLeadDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

class ExamPauseDto {
  /** ISO date the pause runs until; null clears it. */
  @IsOptional() @IsISO8601() until?: string | null;
}

class OrbitApplyDto {
  /** Their campus from the picker; omitted when it isn't listed yet. */
  @IsOptional() @IsUUID() spaceId?: string;
  @IsString() @MinLength(2) @MaxLength(200) collegeName!: string;
  @IsString() @MinLength(1) @MaxLength(60) yearOfStudy!: string;
  @IsString() @MinLength(2) @MaxLength(1000) myClubs!: string;
  @IsString() @MinLength(20) @MaxLength(4000) campusClubs!: string;
  @IsString() @MinLength(20) @MaxLength(2000) why!: string;
  /** 18+ and the Privacy Policy, ticked on the form. */
  @IsBoolean() @Equals(true, { message: 'Confirm you are 18 or older and agree to the Privacy Policy.' })
  confirmed!: boolean;
}

class AppointApplicationDto {
  @IsUUID() spaceId!: string;
}

class DeclineApplicationDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// Guards are per route: /orbit/campuses is public (the apply form's picker).
@Controller('orbit')
export class OrbitController {
  constructor(private readonly orbit: OrbitService) {}

  /** PUBLIC: campuses for the apply form, with whether each still needs a Lead. */
  @Get('campuses')
  campusOptions() {
    return this.orbit.campusOptions();
  }

  /** PUBLIC: aggregate counts for the "Orbit across India" map. No names below
   *  3 applications per college, no personal data. Cached 5 minutes. */
  @Get('application-map')
  applicationMap() {
    return this.orbit.applicationMap();
  }

  /** A signed-in student applies (unifesto.app/orbit/apply). */
  @Post('applications')
  @UseGuards(JwtAuthGuard)
  apply(@Body() dto: OrbitApplyDto, @CurrentUser() user: User) {
    const { confirmed: _confirmed, ...input } = dto;
    return this.orbit.apply(user.id, input);
  }

  /** Every campus ranked (Apex). */
  @Get('admin/leaderboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async leaderboard() {
    return { campuses: await this.orbit.campuses() };
  }

  @Get('admin/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  applications() {
    return this.orbit.applications();
  }

  @Post('admin/applications/:id/appoint')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  appointApplication(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AppointApplicationDto, @CurrentUser() user: User) {
    return this.orbit.appointApplication(id, dto.spaceId, user.id);
  }

  @Patch('admin/applications/:id/decline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  declineApplication(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeclineApplicationDto, @CurrentUser() user: User) {
    return this.orbit.declineApplication(id, dto.note, user.id);
  }

  @Post('admin/leads')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  appoint(@Body() dto: AppointOrbitLeadDto, @CurrentUser() user: User) {
    return this.orbit.appoint(dto.spaceId, dto.email, user.id, dto.role);
  }

  @Patch('admin/leads/:id/end')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  end(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EndOrbitLeadDto, @CurrentUser() user: User) {
    return this.orbit.end(id, dto.reason, user.id);
  }

  @Patch('admin/leads/:id/exam-pause')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  examPause(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExamPauseDto) {
    return this.orbit.setExamPause(id, dto.until ? new Date(dto.until) : null);
  }

  /** The Orbit Lead's view of their own campus (space app), no money. */
  @Get('space/:id')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_MEMBERS)
  forCampus(@Param('id', ParseUUIDPipe) id: string) {
    return this.orbit.forCampus(id);
  }
}
