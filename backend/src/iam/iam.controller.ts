import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Action } from '../auth/authorization/actions';
import { Can } from '../auth/authorization/can.decorator';
import { CanGuard } from '../auth/authorization/can.guard';
import { CapabilityConfigService } from '../auth/authorization/capability-config.service';
import type {
  CapabilityMatrix,
  SpaceCapabilityMatrix,
} from '../auth/authorization/capability-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetGrantDto } from './dto/set-grant.dto';
import { Audit } from '../audit/audit';

/**
 * Platform-Admin IAM: read and edit the capability matrix that decides which
 * roles may perform which actions. Every route is gated by `platform:manage`,
 * which only the Platform Admin holds (via the inheritance superuser rule) — the
 * same guard that protects the rest of Apex's platform surface.
 *
 * The matrix is DB-backed (`role_capabilities`) and cached in memory; edits here
 * call CapabilityConfigService.setGrant, which persists the change and refreshes
 * the cache so authorization decisions pick it up immediately on this instance.
 */
@ApiTags('IAM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CanGuard)
@Controller('iam')
export class IamController {
  constructor(private readonly capabilities: CapabilityConfigService) {}

  @Get('matrix')
  @Can(Action.PLATFORM_MANAGE)
  @ApiOperation({ summary: 'Read the full roles × actions capability matrix' })
  getMatrix(): CapabilityMatrix {
    return this.capabilities.getMatrix();
  }

  @Patch('matrix')
  @Audit('iam.matrix')
  @Can(Action.PLATFORM_MANAGE)
  @ApiOperation({ summary: 'Grant or revoke one (role, action) pair' })
  setGrant(@Body() dto: SetGrantDto): Promise<CapabilityMatrix> {
    return this.capabilities.setGrant(
      dto.code,
      dto.action as Action,
      dto.granted,
    );
  }

  // --- IAM for Spaces (per-space overrides) --------------------------------
  // Gated by `space:manage-members` on the :spaceId in the route — only that
  // space's admin (or a Platform Admin, via inheritance) passes. CanGuard reads
  // params.spaceId for SPACE-scoped actions.

  @Get('space/:spaceId/matrix')
  @Can(Action.SPACE_MANAGE_MEMBERS)
  @ApiOperation({ summary: "Read a space's per-space capability matrix" })
  getSpaceMatrix(
    @Param('spaceId') spaceId: string,
  ): SpaceCapabilityMatrix {
    return this.capabilities.getSpaceMatrix(spaceId);
  }

  @Patch('space/:spaceId/matrix')
  @Audit('iam.space-matrix', (r) => ({ spaceId: r.params.spaceId }))
  @Can(Action.SPACE_MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Grant or revoke one (role, action) within a space' })
  setSpaceGrant(
    @Param('spaceId') spaceId: string,
    @Body() dto: SetGrantDto,
  ): Promise<SpaceCapabilityMatrix> {
    return this.capabilities.setSpaceGrant(
      spaceId,
      dto.code,
      dto.action as Action,
      dto.granted,
    );
  }

  @Delete('space/:spaceId/role/:code')
  @Audit('iam.space-reset', (r) => ({ spaceId: r.params.spaceId }))
  @Can(Action.SPACE_MANAGE_MEMBERS)
  @ApiOperation({ summary: "Reset a role to the platform default in this space" })
  resetSpaceRole(
    @Param('spaceId') spaceId: string,
    @Param('code') code: string,
  ): Promise<SpaceCapabilityMatrix> {
    return this.capabilities.resetSpaceRole(spaceId, code as RoleCode);
  }
}
