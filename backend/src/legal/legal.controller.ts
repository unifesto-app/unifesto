import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { LegalService } from './legal.service';
import { AcceptLegalDto, SaveLegalDraftDto } from './legal.dto';

const SLUG = /^[a-z0-9-]{2,64}$/;
const slugOk = (slug: string) => {
  if (!SLUG.test(slug)) throw new BadRequestException('Bad slug');
  return slug;
};

/** Static routes are declared before ':slug' so they are not captured as a slug. */
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** Documents this user still has to accept (blocking sheet on every client). */
  @Get('pending')
  @UseGuards(JwtAuthGuard)
  pending(@CurrentUser() user: User) {
    return this.legal.pending(user.id);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  listAll() {
    return this.legal.listAll();
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.legal.get(id);
  }

  @Put('admin/:slug/draft')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  saveDraft(@Param('slug') slug: string, @Body() dto: SaveLegalDraftDto) {
    return this.legal.saveDraft(slugOk(slug), dto);
  }

  @Post('admin/:id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.legal.publish(id);
  }

  @Post(':slug/accept')
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: User, @Param('slug') slug: string, @Body() dto: AcceptLegalDto) {
    return this.legal.accept(user.id, slug, dto.version, dto.client);
  }

  /** PUBLIC: the latest published version, for the website. */
  @Get(':slug')
  getPublished(@Param('slug') slug: string) {
    return this.legal.getPublished(slug);
  }
}
