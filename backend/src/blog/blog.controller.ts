import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
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
import { timingSafeEqual } from 'crypto';
import { BlogService } from './blog.service';
import { BlogWriterService } from './blog-writer.service';
import { CreateBlogDto, SearchConsoleDto, UpdateBlogDto } from './dto';

/** Constant-time `Bearer <CRON_SECRET>` check. No secret set means nobody gets in. */
function isCron(auth?: string): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !auth) return false;
  const a = Buffer.from(auth);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('blog')
export class BlogController {
  constructor(
    private readonly blog: BlogService,
    private readonly writer: BlogWriterService,
  ) {}

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

  /** CRON — write and publish the next queued question. Also runs on its own every 8 hours. */
  @Post('generate')
  @HttpCode(200)
  generate(@Headers('authorization') auth?: string) {
    if (!isCron(auth)) throw new UnauthorizedException();
    return this.writer.generate();
  }

  /** ADMIN — the auto-blog question queue. Before ':slug' so it isn't captured. */
  @Get('questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  listQuestions() {
    return this.writer.listQuestions();
  }

  /** ADMIN — re-queue a FAILED question. */
  @Post('questions/:id/retry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  retryQuestion(@Param('id') id: string) {
    return this.writer.retryQuestion(id);
  }

  /** ADMIN — weekly Search Console Pages CSV; queues 10 questions related to posts that get clicks. */
  @Post('questions/search-console')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  learn(@Body() dto: SearchConsoleDto) {
    return this.writer.learnFromSearchConsole(dto.csv);
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
