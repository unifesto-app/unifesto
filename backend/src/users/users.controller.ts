import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import { UsersService } from './users.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/decorators';
import {
  UpdateProfileDto,
  CheckUsernameDto,
  UpdateNotificationSettingsDto,
  ReportAppVersionDto,
} from './dto';
import type { User } from '@prisma/client';
import { UserProfileDto } from '../auth/dto';
import { RoleCode } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get current user profile
   * GET /users/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: User): Promise<UserProfileDto> {
    return this.usersService.getMe(user.id);
  }

  /**
   * Update current user profile
   * PATCH /users/me
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.usersService.updateMe(user.id, dto);
  }

  /**
   * Report the app version/platform this client is running.
   * PATCH /users/me/app-version
   */
  @Patch('me/app-version')
  @UseGuards(JwtAuthGuard)
  async reportAppVersion(
    @CurrentUser() user: User,
    @Body() dto: ReportAppVersionDto,
  ) {
    return this.usersService.updateMyAppVersion(user.id, dto);
  }

  /**
   * Request deletion of my account. Nothing is removed yet: the account
   * closes automatically after the 30-day grace period unless cancelled.
   * DELETE /users/me
   */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteMe(@CurrentUser() user: User) {
    return this.usersService.requestAccountDeletion(user.id);
  }

  /**
   * Cancel a pending account deletion during the grace period.
   * POST /users/me/deletion/cancel
   */
  @Post('me/deletion/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelDeletion(@CurrentUser() user: User) {
    return this.usersService.cancelAccountDeletion(user.id);
  }

  /**
   * Upload avatar
   * POST /users/me/avatar
   */
  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', uploadLimit(5)))
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    return this.usersService.uploadAvatar(user.id, file);
  }

  /**
   * Get current user's linked accounts (identities)
   * GET /users/me/identities
   */
  @Get('me/identities')
  @UseGuards(JwtAuthGuard)
  async getMyIdentities(@CurrentUser() user: User) {
    return this.usersService.getUserIdentities(user.id);
  }

  /**
   * Set an identity as the primary email for notifications
   * PATCH /users/me/identities/:id/primary
   */
  @Patch('me/identities/:id/primary')
  @UseGuards(JwtAuthGuard)
  async setPrimaryIdentity(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.setPrimaryIdentity(user.id, id);
  }

  /**
   * Remove a linked identity/account
   * DELETE /users/me/identities/:id
   */
  @Delete('me/identities/:id')
  @UseGuards(JwtAuthGuard)
  async removeIdentity(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.removeIdentity(user.id, id);
  }

  /**
   * Get current user's spaces (where user is a member)
   * GET /users/me/spaces
   */
  @Get('me/spaces')
  @UseGuards(JwtAuthGuard)
  async getMySpaces(
    @CurrentUser() user: User,
    @Query('includeEventRoles') includeEventRoles?: string,
  ) {
    // Opt-in (space app only): also surface spaces the user can reach through an
    // event-scoped role (curator/co-curator/crew assigned to an event, whose
    // UserRole has no spaceId). Default stays unchanged for apex/mobile.
    return this.usersService.getUserSpaces(user.id, {
      includeEventRoles: includeEventRoles === 'true',
    });
  }

  /**
   * Get current user's notification settings
   * GET /users/me/notification-settings
   */
  @Get('me/notification-settings')
  @UseGuards(JwtAuthGuard)
  async getNotificationSettings(@CurrentUser() user: User) {
    return this.usersService.getNotificationSettings(user.id);
  }

  /**
   * Update current user's notification settings
   * PATCH /users/me/notification-settings
   */
  @Patch('me/notification-settings')
  @UseGuards(JwtAuthGuard)
  async updateNotificationSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.usersService.updateNotificationSettings(user.id, dto);
  }

  /**
   * Check username availability
   * POST /users/check-username
   */
  @Post('check-username')
  async checkUsername(
    @Body() dto: CheckUsernameDto,
  ): Promise<{ available: boolean }> {
    return this.usersService.checkUsernameAvailability(dto.username);
  }

  /**
   * Get all users (ADMIN only)
   * GET /users?page=1&limit=10&search=query
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    // Clamp (S29): an unbounded `limit` is a full-table read.
    const limitNum = Math.min(Math.max(parseInt(limit ?? '', 10) || 10, 1), 100);

    return this.usersService.getAllUsers({
      page: pageNum,
      limit: limitNum,
      search,
    });
  }

  /**
   * Get user by ID (ADMIN only)
   * GET /users/:id (UUID format)
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getUserById(@Param('id') id: string) {
    // Check if it's a UUID (for admin lookup) or username (for public profile)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    if (isUUID) {
      return this.usersService.getUserByIdAdmin(id);
    } else {
      return this.usersService.getUserByUsername(id);
    }
  }

  /**
   * Update user by ID (ADMIN only)
   * PATCH /users/:id
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async updateUserById(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateUserByIdAdmin(id, dto);
  }

  /**
   * Delete user by ID (ADMIN only)
   * DELETE /users/:id
   */
  // @Delete(':id')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(RoleCode.ADMIN)
  // async deleteUserById(@Param('id') id: string) {
  //   return this.usersService.deleteUserByIdAdmin(id);
  // }
}
