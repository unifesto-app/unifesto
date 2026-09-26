import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { RoleCode } from '@prisma/client';
import { EmailCampaignsService } from '../email-campaigns/email-campaigns.service';
import { EmailTemplatesService } from '../email-campaigns/email-templates.service';
import {
  CreateCampaignDto,
  PreviewCampaignDto,
} from '../email-campaigns/dto/campaign.dto';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from '../email-campaigns/dto/template.dto';

/**
 * Platform email console (apex). Full target set — all users, organisers,
 * segments, plus any space/event/user. Delegates to the shared
 * EmailCampaignsService with the platform scope (`spaceId: null`), so campaign
 * lists here never see space-owned campaigns and vice-versa. Templates managed
 * here are the GLOBAL library every space can start from.
 */
@Controller('admin/email')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminEmailController {
  private readonly scope = { spaceId: null } as const;

  constructor(
    private readonly campaigns: EmailCampaignsService,
    private readonly templates: EmailTemplatesService,
  ) {}

  // --- Campaigns -----------------------------------------------------------

  @Post('campaigns')
  createCampaign(@CurrentUser() user: User, @Body() dto: CreateCampaignDto) {
    return this.campaigns.createCampaign(this.scope, user.id, dto);
  }

  @Get('campaigns')
  listCampaigns(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.campaigns.listCampaigns(
      this.scope,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string) {
    return this.campaigns.getCampaign(this.scope, id);
  }

  @Post('campaigns/:id/cancel')
  cancelCampaign(@Param('id') id: string) {
    return this.campaigns.cancelCampaign(this.scope, id);
  }

  @Post('preview')
  preview(@Body() dto: PreviewCampaignDto) {
    return { html: this.campaigns.renderPreview(dto.body) };
  }

  // --- GLOBAL templates ----------------------------------------------------

  @Get('templates')
  listTemplates() {
    return this.templates.listGlobal();
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.templates.getGlobal(id);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: User, @Body() dto: CreateTemplateDto) {
    return this.templates.createGlobal(user.id, dto);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.updateGlobal(id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.templates.deleteGlobal(id);
  }
}
