import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { HelpService } from './help.service';
import { CreateHelpArticleDto, UpdateHelpArticleDto } from './dto';

@Controller('help')
export class HelpController {
  constructor(private readonly help: HelpService) {}

  /** PUBLIC — published articles (no body) for unifesto.app/help. */
  @Get()
  list() {
    return this.help.listPublished();
  }

  /** ADMIN — every article, any status. Before ':slug' so it isn't captured. */
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  listAll() {
    return this.help.listAll();
  }

  /** ADMIN — create an article. */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateHelpArticleDto) {
    return this.help.create(dto, user.id);
  }

  /** ADMIN — edit an article. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateHelpArticleDto) {
    return this.help.update(id, dto);
  }

  /** ADMIN — delete an article. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  remove(@Param('id') id: string) {
    return this.help.remove(id);
  }

  /** PUBLIC — one published article by slug. Declared last so admin wins. */
  @Get(':slug')
  getOne(@Param('slug') slug: string) {
    return this.help.getBySlug(slug);
  }
}
