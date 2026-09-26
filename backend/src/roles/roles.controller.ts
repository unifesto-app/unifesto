import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AssignRoleDto } from './dto';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Raw role-grant API. Platform-admin only: these write/read UserRole rows
 * directly with no scope checks, so exposing them to any signed-in user lets
 * anyone grant themselves ADMIN. Space/event team changes go through the
 * capability-gated routes on spaces/events instead.
 */
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * Get all available roles
   * GET /roles
   */
  @Get()
  async getAllRoles() {
    return this.rolesService.getAllRoles();
  }

  /**
   * Get user roles
   * GET /roles/users/:userId
   */
  @Get('users/:userId')
  async getUserRoles(@Param('userId') userId: string) {
    return this.rolesService.getUserRoles(userId);
  }

  /**
   * Assign role to user
   * POST /roles/assign
   */
  @Post('assign')
  async assignRole(@Body() dto: AssignRoleDto, @CurrentUser() user: User) {
    return this.rolesService.assignRole(dto, user.id);
  }

  /**
   * Remove role from user
   * DELETE /roles/:userRoleId
   */
  @Delete(':userRoleId')
  async removeRole(@Param('userRoleId') userRoleId: string) {
    return this.rolesService.removeRole(userRoleId);
  }

  /**
   * Check if user has specific role
   * GET /roles/check/:userId/:roleCode
   */
  @Get('check/:userId/:roleCode')
  async checkRole(
    @Param('userId') userId: string,
    @Param('roleCode') roleCode: string,
  ) {
    const hasRole = await this.rolesService.hasRole(userId, roleCode as any);
    return { hasRole };
  }
}
