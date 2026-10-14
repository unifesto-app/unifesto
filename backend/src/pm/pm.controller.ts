import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/decorators';
import { PmService } from './pm.service';
import { PmMcp } from './pm.mcp';
import {
  AddNoteDto,
  CreateTokenDto,
  UpsertTaskDto,
  UpsertTrackDto,
} from './dto';

const actorOf = (u: User) => `${u.fullName || u.username || 'Admin'} (apex)`;

/** Apex product dashboard (platform ADMIN only). */
@Controller('pm')
export class PmController {
  constructor(
    private readonly pm: PmService,
    private readonly mcp: PmMcp,
  ) {}

  /**
   * MCP endpoint for Claude Code / claude.ai. Authenticated by a PM token
   * (not a session JWT), so it sits outside the ADMIN guards; resolveToken
   * re-checks ADMIN on every call.
   */
  @Post('mcp')
  async mcpPost(@Req() req: Request, @Res() res: Response) {
    const [scheme, raw] = (req.headers.authorization ?? '').split(' ');
    const who =
      scheme === 'Bearer' && raw ? await this.pm.resolveToken(raw) : null;
    if (!who) throw new UnauthorizedException('Invalid or revoked PM token');

    const body = req.body;
    if (Array.isArray(body)) {
      const out = (
        await Promise.all(body.map((m) => this.mcp.handle(m, who.actor)))
      ).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await this.mcp.handle(body, who.actor);
    return out ? res.json(out) : res.status(202).end();
  }

  /** Stateless server: no SSE stream, no sessions to delete. */
  @Get('mcp')
  @HttpCode(405)
  @Header('Allow', 'POST')
  mcpGet() {
    return { error: 'Use POST' };
  }

  @Get('board')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  board() {
    return this.pm.board();
  }

  @Get('activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  activity(@Query('take') take?: string) {
    return this.pm.activity(Number(take) || 50);
  }

  @Put('tracks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  upsertTrack(@Body() dto: UpsertTrackDto) {
    return this.pm.upsertTrack(dto.key, dto.name, dto.sortOrder);
  }

  @Put('tasks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  upsertTask(@CurrentUser() user: User, @Body() dto: UpsertTaskDto) {
    return this.pm.upsertTask(dto, actorOf(user));
  }

  @Get('tasks/:key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  getTask(@Param('key') key: string) {
    return this.pm.getTask(key);
  }

  @Post('tasks/:key/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  startWork(@CurrentUser() user: User, @Param('key') key: string) {
    return this.pm.startWork(key, actorOf(user));
  }

  @Post('notes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  addNote(@CurrentUser() user: User, @Body() dto: AddNoteDto) {
    return this.pm.addNote(actorOf(user), dto.message, dto.key);
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  tokens(@CurrentUser() user: User) {
    return this.pm.listTokens(user.id);
  }

  @Post('tokens')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  createToken(@CurrentUser() user: User, @Body() dto: CreateTokenDto) {
    return this.pm.createToken(user.id, dto.name);
  }

  @Delete('tokens/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  revokeToken(@CurrentUser() user: User, @Param('id') id: string) {
    return this.pm.revokeToken(user.id, id);
  }
}
