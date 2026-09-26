import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApplicationStatus, RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { CareersService, RESUME_MAX_BYTES } from './careers.service';
import {
  ApplyDto,
  CreateCareerDto,
  UpdateApplicationDto,
  UpdateCareerDto,
} from './dto';

@Controller('careers')
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  /** PUBLIC — open roles for the marketing site. */
  @Get()
  list(@Query('department') department?: string, @Query('type') type?: string) {
    return this.careers.listPublic(department, type);
  }

  /**
   * ADMIN — every role, any status. Declared before ':id' so "admin" is not
   * captured as a career id.
   */
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  listAll() {
    return this.careers.listAll();
  }

  /** ADMIN — create a role. */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateCareerDto) {
    return this.careers.create(dto, user.id);
  }

  /** ADMIN — applications for one role. */
  @Get(':careerId/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  listApplications(@Param('careerId') careerId: string) {
    return this.careers.listApplications(careerId);
  }

  /** PUBLIC — submit an application (with resume) to an open role. */
  @Post(':careerId/apply')
  // Public upload: cap at the multer layer so an oversized body is rejected
  // while streaming, not after being buffered whole into memory.
  @UseInterceptors(
    FileInterceptor('resume', { limits: { fileSize: RESUME_MAX_BYTES, files: 1 } }),
  )
  apply(
    @Param('careerId') careerId: string,
    @Body() dto: ApplyDto,
    @UploadedFile() resume: Express.Multer.File,
  ) {
    return this.careers.apply(careerId, dto, resume);
  }

  /** ADMIN — update an application's status. */
  @Patch('applications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  updateApplication(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.careers.updateApplicationStatus(
      id,
      dto.status as ApplicationStatus,
    );
  }

  /** ADMIN — delete an application. */
  @Delete('applications/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  removeApplication(@Param('id') id: string) {
    return this.careers.removeApplication(id);
  }

  /** PUBLIC — one open role by id. */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.careers.getPublic(id);
  }

  /** ADMIN — edit a role. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCareerDto) {
    return this.careers.update(id, dto);
  }

  /** ADMIN — delete a role. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  remove(@Param('id') id: string) {
    return this.careers.remove(id);
  }
}
