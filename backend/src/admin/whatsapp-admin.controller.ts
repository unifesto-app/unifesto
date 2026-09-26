import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppReplyDto } from '../whatsapp/dto/reply.dto';
import { WhatsAppInitiateDto } from '../whatsapp/dto/initiate.dto';
import { WhatsAppBroadcastDto } from '../whatsapp/dto/broadcast.dto';

/**
 * Admin-only WhatsApp inbox: read the messages the Business number received and
 * reply to them from Apex. All routes are platform-admin gated.
 *
 *   GET  /admin/whatsapp/conversations            -> paginated inbox
 *   GET  /admin/whatsapp/conversations/:id        -> one thread (marks read)
 *   POST /admin/whatsapp/conversations/:id/reply  -> free-form text reply
 *   POST /admin/whatsapp/conversations/initiate   -> start a convo via template
 *   GET  /admin/whatsapp/stats                     -> headline counters
 */
@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class WhatsAppAdminController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('stats')
  getStats() {
    return this.whatsappService.getInboxStats();
  }

  @Get('templates')
  listTemplates() {
    return this.whatsappService.listMessageTemplates();
  }

  /* ----------------------------- Broadcast ------------------------------- */

  /** Spaces (with member counts) for the broadcast audience picker. */
  @Get('broadcast/spaces')
  broadcastSpaces() {
    return this.whatsappService.listBroadcastSpaces();
  }

  /** Typeahead for the "specific users" audience. */
  @Get('broadcast/users')
  broadcastUsers(@Query('search') search?: string, @Query('limit') limit?: string) {
    return this.whatsappService.searchBroadcastUsers(
      search ?? '',
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  /**
   * Send a pre-approved template to a chosen audience (all users, one space's
   * members, or specific users). Returns the resolved recipient count; delivery
   * runs in the background.
   */
  @Post('broadcast')
  broadcast(@Body() dto: WhatsAppBroadcastDto, @CurrentUser() user: User) {
    return this.whatsappService.sendBroadcastTemplate({
      adminUserId: user.id,
      audience: dto.audience,
      spaceId: dto.spaceId,
      userIds: dto.userIds,
      templateName: dto.templateName,
      bodyParams: dto.bodyParams,
      languageCode: dto.languageCode,
    });
  }

  @Get('conversations')
  listConversations(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.whatsappService.listConversations({
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('conversations/:id')
  getConversation(@Param('id', ParseUUIDPipe) id: string) {
    return this.whatsappService.getConversation(id);
  }

  @Post('conversations/initiate')
  initiate(@Body() dto: WhatsAppInitiateDto, @CurrentUser() user: User) {
    return this.whatsappService.initiateConversation({
      adminUserId: user.id,
      to: dto.to,
      templateName: dto.templateName,
      bodyParams: dto.bodyParams,
      languageCode: dto.languageCode,
    });
  }

  @Post('conversations/:id/reply')
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WhatsAppReplyDto,
    @CurrentUser() user: User,
  ) {
    return this.whatsappService.sendReply(id, user.id, dto.body);
  }

  /**
   * Send a media reply (image / video / audio / document) inside the 24h window.
   * Multipart: `file` is the attachment, `caption` an optional text caption.
   * Capped at 64MB — WhatsApp's own document limit is 100MB, but we buffer the
   * upload in memory, so we keep it well under that.
   */
  @Post('conversations/:id/media')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 64 * 1024 * 1024 } }),
  )
  sendMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption: string | undefined,
    @CurrentUser() user: User,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    return this.whatsappService.sendMediaReply(id, user.id, file, caption);
  }
}
