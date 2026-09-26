import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { BlogService } from './blog.service';
import { CreateBlogDto, UpdateBlogDto } from './dto';

@Controller('blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  /** PUBLIC — published posts for the marketing site. */
  @Get()
  list(@Query('category') category?: string) {
    return this.blog.listPublished(category);
  }

  /** ADMIN — every post, any status. Before ':slug' so it isn't captured. */
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  listAll() {
    return this.blog.listAll();
  }

  /** ADMIN — upload a cover image; returns its URL. */
  @Post('cover')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadLimit(10)))
  uploadCover(@UploadedFile() file: Express.Multer.File) {
    return this.blog.uploadCover(file);
  }

  /** ADMIN — create a post. */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateBlogDto) {
    return this.blog.create(dto, user.id);
  }

  /** ADMIN — edit a post. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateBlogDto) {
    return this.blog.update(id, dto);
  }

  /** ADMIN — delete a post. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  remove(@Param('id') id: string) {
    return this.blog.remove(id);
  }

  /** PUBLIC — one published post by slug. Declared last so admin/static wins. */
  @Get(':slug')
  getOne(@Param('slug') slug: string) {
    return this.blog.getBySlug(slug);
  }
}
