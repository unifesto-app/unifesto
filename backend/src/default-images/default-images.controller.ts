import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Action, Can, CanGuard } from '../auth/authorization';
import { uploadLimit } from '../common/upload-limits';
import { DefaultImagesService } from './default-images.service';

@Controller()
export class DefaultImagesController {
  constructor(private readonly images: DefaultImagesService) {}

  /** Public: stand-in banners and logos the apps pick from. */
  @Get('default-images')
  list() {
    return this.images.listPublic();
  }

  @Get('admin/default-images')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  listAll() {
    return this.images.listAll();
  }

  /** Multipart: `file` (the image) + `kind` (BANNER | LOGO). */
  @Post('admin/default-images')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  @UseInterceptors(FileInterceptor('file', uploadLimit(5)))
  add(@CurrentUser() user: User, @Body('kind') kind: string, @UploadedFile() file: Express.Multer.File) {
    return this.images.add(kind, file, user.id);
  }

  @Delete('admin/default-images/:id')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.PLATFORM_MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.images.remove(id);
  }
}
