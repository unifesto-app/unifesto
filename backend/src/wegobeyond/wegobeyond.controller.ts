import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import { IsInt, IsObject, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Action, Can, CanGuard } from '../auth/authorization';
import { uploadLimit } from '../common/upload-limits';
import { WegobeyondService } from './wegobeyond.service';

class SaveDocDto {
  @IsObject()
  data: Record<string, unknown>;

  /** The version the editor loaded; a stale one is refused with 409. */
  @IsInt()
  @Min(1)
  version: number;
}

/** wegobeyond.in renders from these; a minute stale is fine, an edit shows within ~1 min. */
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=600';

@Controller()
export class WegobeyondController {
  constructor(private readonly wegobeyond: WegobeyondService) {}

  /** PUBLIC: all six documents, keyed by name. */
  @Get('wegobeyond/content')
  @Header('Cache-Control', PUBLIC_CACHE)
  content() {
    return this.wegobeyond.publicContent();
  }

  /** PUBLIC: one document (initiatives, gallery, team, press, crew, settings). */
  @Get('wegobeyond/content/:name')
  @Header('Cache-Control', PUBLIC_CACHE)
  doc(@Param('name') name: string) {
    return this.wegobeyond.publicDoc(name);
  }

  /** PUBLIC: a "Join the crew" sign-up from the site. */
  @Post('wegobeyond/crew-signups')
  @HttpCode(200)
  // Per IP: a campus room signs up together behind one Wi-Fi NAT address.
  @Throttle({ default: { limit: 30, ttl: 600000 } })
  signUp(@Body() body: Record<string, unknown>) {
    return this.wegobeyond.signUp(body ?? {});
  }

  @Get('admin/wegobeyond/docs/:name')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  adminDoc(@Param('name') name: string) {
    return this.wegobeyond.adminDoc(name);
  }

  @Put('admin/wegobeyond/docs/:name')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  save(
    @CurrentUser() user: User,
    @Param('name') name: string,
    @Body() dto: SaveDocDto,
  ) {
    return this.wegobeyond.save(name, dto.data, dto.version, user.id);
  }

  /** Multipart `file`: a gallery photo (JPG, PNG or WebP, 3 MB max). */
  @Post('admin/wegobeyond/photos')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  @UseInterceptors(FileInterceptor('file', uploadLimit(3)))
  uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    return this.wegobeyond.uploadPhoto(file);
  }

  @Get('admin/wegobeyond/crew-signups')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  signups() {
    return this.wegobeyond.listSignups();
  }
}
