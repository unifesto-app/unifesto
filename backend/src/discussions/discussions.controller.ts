import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  ParseBoolPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { DiscussionsService } from './discussions.service';
import {
  CreateDiscussionDto,
  CreateReplyDto,
  UpdateDiscussionDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Discussions')
@Controller('discussions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DiscussionsController {
  constructor(private readonly discussionsService: DiscussionsService) {}

  /**
   * Get all discussions for a space
   */
  @Get('space/:spaceId')
  @ApiOperation({ summary: 'Get discussions by space ID' })
  async getDiscussionsBySpace(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Req() req: any,
    @Query('pinned') pinned?: string,
  ) {
    const pinnedBool = pinned === 'true' ? true : pinned === 'false' ? false : undefined;
    return this.discussionsService.getDiscussionsBySpace(
      spaceId,
      { page, limit, pinned: pinnedBool },
      req.user.id,
    );
  }

  /**
   * Get discussion by ID with replies
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get discussion by ID' })
  async getDiscussionById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.discussionsService.getDiscussionById(id, req.user.id);
  }

  /**
   * Create a new discussion
   */
  @Post()
  @ApiOperation({ summary: 'Create a new discussion' })
  async createDiscussion(
    @Body() dto: CreateDiscussionDto,
    @Req() req: any,
  ) {
    return this.discussionsService.createDiscussion(dto, req.user.id);
  }

  /**
   * Update discussion
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update discussion' })
  async updateDiscussion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiscussionDto,
    @Req() req: any,
  ) {
    return this.discussionsService.updateDiscussion(id, dto, req.user.id);
  }

  /**
   * Delete discussion
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete discussion' })
  async deleteDiscussion(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.discussionsService.deleteDiscussion(id, req.user.id);
  }

  /**
   * Pin discussion (ADMIN only)
   */
  @Patch(':id/pin')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Pin/Unpin discussion (ADMIN)' })
  async togglePin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isPinned', ParseBoolPipe) isPinned: boolean,
  ) {
    return this.discussionsService.togglePin(id, isPinned);
  }

  /**
   * Lock discussion (ADMIN only)
   */
  @Patch(':id/lock')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  @ApiOperation({ summary: 'Lock/Unlock discussion (ADMIN)' })
  async toggleLock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isLocked', ParseBoolPipe) isLocked: boolean,
  ) {
    return this.discussionsService.toggleLock(id, isLocked);
  }

  /**
   * Create a reply to discussion
   */
  @Post('replies')
  @ApiOperation({ summary: 'Create a reply to discussion' })
  async createReply(
    @Body() dto: CreateReplyDto,
    @Req() req: any,
  ) {
    return this.discussionsService.createReply(dto, req.user.id);
  }

  /**
   * Delete reply
   */
  @Delete('replies/:id')
  @ApiOperation({ summary: 'Delete reply' })
  async deleteReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.discussionsService.deleteReply(id, req.user.id);
  }
}
