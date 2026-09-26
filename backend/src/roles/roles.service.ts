import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignRoleDto } from './dto';
import { Role, UserRole, RoleCode, RoleScope } from '@prisma/client';

export interface UserRoleDetails {
  id: string; // UserRole assignment ID
  roleId: string;
  roleCode: RoleCode;
  roleName: string;
  roleScope: RoleScope;
  spaceId: string | null;
  eventId: string | null;
  assignedAt: Date;
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all available roles
   */
  async getAllRoles(): Promise<Role[]> {
    return this.prisma.role.findMany({
      orderBy: [{ scope: 'asc' }, { code: 'asc' }],
    });
  }

  /**
   * Get user roles with details
   */
  async getUserRoles(userId: string): Promise<UserRoleDetails[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: true,
      },
      orderBy: [{ role: { scope: 'asc' } }, { role: { code: 'asc' } }],
    });

    return userRoles.map((ur) => ({
      id: ur.id, // UserRole assignment ID
      roleId: ur.role.id,
      roleCode: ur.role.code,
      roleName: ur.role.name,
      roleScope: ur.role.scope,
      spaceId: ur.spaceId,
      eventId: ur.eventId,
      assignedAt: ur.createdAt,
    }));
  }

  /**
   * Assign role to user
   */
  async assignRole(dto: AssignRoleDto, assignedBy: string): Promise<UserRole> {
    // Validate role exists
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Validate scope constraints
    if (role.scope === RoleScope.PLATFORM && (dto.spaceId || dto.eventId)) {
      throw new BadRequestException(
        'Platform roles cannot have a space_id or event_id',
      );
    }

    if (role.scope === RoleScope.SPACE) {
      if (!dto.spaceId) {
        throw new BadRequestException('Space roles must have a space_id');
      }
      if (dto.eventId) {
        throw new BadRequestException('Space roles cannot have an event_id');
      }
    }

    if (role.scope === RoleScope.EVENT) {
      if (!dto.eventId) {
        throw new BadRequestException('Event roles must have an event_id');
      }
      if (dto.spaceId) {
        throw new BadRequestException('Event roles cannot have a space_id');
      }

      const event = await this.prisma.event.findUnique({
        where: { id: dto.eventId },
      });

      if (!event) {
        throw new NotFoundException('Event not found');
      }
    }

    // Validate the target space exists. The flat admin model has no per-role
    // caps (a space may have any number of Space Admins and Members), so there
    // are no count limits to enforce here.
    if (role.scope === RoleScope.SPACE && dto.spaceId) {
      const space = await this.prisma.space.findUnique({
        where: { id: dto.spaceId },
      });

      if (!space) {
        throw new NotFoundException('Space not found');
      }
    }

    // Check if role assignment already exists
    const existing = await this.prisma.userRole.findFirst({
      where: {
        userId: dto.userId,
        roleId: dto.roleId,
        spaceId: dto.spaceId || null,
        eventId: dto.eventId || null,
      },
    });

    if (existing) {
      throw new ConflictException('Role already assigned to user');
    }

    // Assign role
    const userRole = await this.prisma.userRole.create({
      data: {
        userId: dto.userId,
        roleId: dto.roleId,
        spaceId: dto.spaceId || undefined,
        eventId: dto.eventId || undefined,
        assignedBy,
      },
    });

    return userRole;
  }

  /**
   * Remove role from user
   */
  async removeRole(userRoleId: string): Promise<{ message: string }> {
    await this.prisma.userRole.delete({
      where: { id: userRoleId },
    });

    return { message: 'Role removed successfully' };
  }

  /**
   * Check if user has specific role
   */
  async hasRole(
    userId: string,
    roleCode: RoleCode,
    spaceId?: string,
  ): Promise<boolean> {
    const where: any = {
      userId,
      role: {
        code: roleCode,
      },
    };

    if (spaceId) {
      where.spaceId = spaceId;
    }

    const userRole = await this.prisma.userRole.findFirst({
      where,
    });

    return !!userRole;
  }

  /**
   * Check if user is admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    return this.hasRole(userId, RoleCode.ADMIN);
  }

  /**
   * Get user roles for a specific space
   */
  async getUserRolesForSpace(
    userId: string,
    spaceId: string,
  ): Promise<UserRoleDetails[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { spaceId },
          { role: { scope: RoleScope.PLATFORM } },
        ],
      },
      include: {
        role: true,
      },
    });

    return userRoles.map((ur) => ({
      id: ur.id, // UserRole assignment ID
      roleId: ur.role.id,
      roleCode: ur.role.code,
      roleName: ur.role.name,
      roleScope: ur.role.scope,
      spaceId: ur.spaceId,
      eventId: ur.eventId,
      assignedAt: ur.createdAt,
    }));
  }
}
