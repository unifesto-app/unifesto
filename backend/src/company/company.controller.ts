import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Action, Can, CanGuard } from '../auth/authorization';
import { CompanyService } from './company.service';
import { AddCompanyNoteDto, UpsertCompanyItemDto } from './dto';

/**
 * Apex Company section. company:view reads, company:edit writes; the service
 * narrows writes further (owners vs company:manage) and hides restricted rows.
 */
@Controller('company')
@UseGuards(JwtAuthGuard, CanGuard)
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get('items')
  @Can(Action.COMPANY_VIEW)
  list(@CurrentUser() user: User) {
    return this.company.list(user);
  }

  @Get('items/:number')
  @Can(Action.COMPANY_VIEW)
  get(
    @CurrentUser() user: User,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.company.get(user, number);
  }

  @Put('items')
  @Can(Action.COMPANY_EDIT)
  upsert(@CurrentUser() user: User, @Body() dto: UpsertCompanyItemDto) {
    return this.company.upsert(user, dto);
  }

  @Post('items/:number/notes')
  @Can(Action.COMPANY_EDIT)
  addNote(
    @CurrentUser() user: User,
    @Param('number', ParseIntPipe) number: number,
    @Body() dto: AddCompanyNoteDto,
  ) {
    return this.company.addNote(user, number, dto.message);
  }

  @Get('people')
  @Can(Action.COMPANY_VIEW)
  people() {
    return this.company.people();
  }
}
