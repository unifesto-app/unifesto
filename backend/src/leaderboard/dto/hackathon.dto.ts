import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HackathonPsMode, HackathonThemeMode } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  STATEMENT_CODE_MAX,
  STATEMENT_TEXT_MAX,
  STATEMENT_TITLE_MAX,
  TEAM_CODE_DIGITS_MAX,
  TEAM_CODE_DIGITS_MIN,
  TEAM_NAME_MAX,
  THEME_NAME_MAX,
} from '../hackathon.shared';

/**
 * Hackathon settings. Every field is optional: omitted = unchanged, and for the
 * nullable ones `null` clears the value (the venue falls back to the event's).
 */
export class UpdateHackathonConfigDto {
  @ApiPropertyOptional({ example: 'HACK25-', description: 'Team ID prefix' })
  @IsOptional() @IsString() @MaxLength(20)
  teamCodePrefix?: string | null;

  @ApiPropertyOptional({ minimum: TEAM_CODE_DIGITS_MIN, maximum: TEAM_CODE_DIGITS_MAX })
  @IsOptional() @IsInt() @Min(TEAM_CODE_DIGITS_MIN) @Max(TEAM_CODE_DIGITS_MAX)
  teamCodeDigits?: number;

  @ApiPropertyOptional({ description: 'Next number to hand out; can only move forward' })
  @IsOptional() @IsInt() @Min(1) @Max(999999)
  teamCodeNext?: number;

  @ApiPropertyOptional({ description: 'Per-group TEXT registration question used as the team name' })
  @IsOptional() @IsUUID()
  teamNameFieldId?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  venueName?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  venueAddress?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  venueLat?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  venueLng?: number | null;

  @ApiPropertyOptional({ description: 'Maps link shown to teams' })
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2000)
  venueMapUrl?: string | null;

  @ApiPropertyOptional({ description: 'e.g. "Enter through Gate 3"' })
  @IsOptional() @IsString() @MaxLength(1000)
  venueNotes?: string | null;

  @ApiPropertyOptional({ enum: HackathonPsMode, description: 'How teams get a problem statement; null = not open yet' })
  @IsOptional() @IsEnum(HackathonPsMode)
  psMode?: HackathonPsMode | null;

  @ApiPropertyOptional({ enum: HackathonThemeMode, description: 'Theme from the list, or short free text' })
  @IsOptional() @IsEnum(HackathonThemeMode)
  themeMode?: HackathonThemeMode;

  @ApiPropertyOptional({ description: 'After this, teams can no longer choose; the curator assigns. null = no deadline' })
  @IsOptional() @IsDateString()
  psDeadline?: string | null;
}

export class ImportHackathonTeamsDto {
  @ApiPropertyOptional({ description: 'Only these ticket types (default: all)' })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true })
  ticketTypeIds?: string[];
}

export class UpdateHackathonTeamDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @IsString() @MaxLength(40)
  teamCode?: string;

  @ApiPropertyOptional({ maxLength: TEAM_NAME_MAX })
  @IsOptional() @IsString() @MaxLength(TEAM_NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ description: 'Room to put the team in; null removes it from its room' })
  @IsOptional() @IsUUID()
  roomId?: string | null;
}

export class RenameMyTeamDto {
  @ApiProperty({ maxLength: TEAM_NAME_MAX })
  @IsString() @IsNotEmpty() @MaxLength(TEAM_NAME_MAX)
  name: string;
}

export class CreateHackathonRoomDto {
  @ApiProperty({ maxLength: 120 })
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  location?: string | null;

  @ApiProperty({ description: 'How many teams fit', minimum: 1 })
  @IsInt() @Min(1) @Max(10000)
  capacity: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class UpdateHackathonRoomDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  location?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional() @IsInt() @Min(1) @Max(10000)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

// ── Problem statements & themes ──────────────────────────────────────────────

export class CreateHackathonThemeDto {
  @ApiProperty({ maxLength: THEME_NAME_MAX, example: 'HealthTech' })
  @IsString() @IsNotEmpty() @MaxLength(THEME_NAME_MAX)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class UpdateHackathonThemeDto {
  @ApiPropertyOptional({ maxLength: THEME_NAME_MAX })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(THEME_NAME_MAX)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class CreateHackathonStatementDto {
  @ApiPropertyOptional({ maxLength: STATEMENT_CODE_MAX, description: 'Blank = the next free "PS-NN"' })
  @IsOptional() @IsString() @MaxLength(STATEMENT_CODE_MAX)
  code?: string | null;

  @ApiProperty({ maxLength: STATEMENT_TITLE_MAX })
  @IsString() @IsNotEmpty() @MaxLength(STATEMENT_TITLE_MAX)
  title: string;

  @ApiProperty({ maxLength: STATEMENT_TEXT_MAX })
  @IsString() @MaxLength(STATEMENT_TEXT_MAX)
  description: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  themeId?: string | null;

  @ApiPropertyOptional({ description: 'How many teams may take it; null = no limit', minimum: 1 })
  @IsOptional() @IsInt() @Min(1) @Max(10000)
  maxTeams?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class UpdateHackathonStatementDto {
  @ApiPropertyOptional({ maxLength: STATEMENT_CODE_MAX })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(STATEMENT_CODE_MAX)
  code?: string;

  @ApiPropertyOptional({ maxLength: STATEMENT_TITLE_MAX })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(STATEMENT_TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({ maxLength: STATEMENT_TEXT_MAX })
  @IsOptional() @IsString() @MaxLength(STATEMENT_TEXT_MAX)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  themeId?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional() @IsInt() @Min(1) @Max(10000)
  maxTeams?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

/**
 * A problem statement for a team: one from the list (`statementId`) or its own
 * (`title` + `description`), plus a theme when the statement doesn't bring one
 * (`themeId` from the list, or `themeText` when themes are free text). Used by
 * the team lead to lock theirs in and by the curator to assign one.
 */
export class SetTeamStatementDto {
  @ApiPropertyOptional({ description: 'A statement from the list' })
  @IsOptional() @IsUUID()
  statementId?: string | null;

  @ApiPropertyOptional({ maxLength: STATEMENT_TITLE_MAX, description: 'Own statement: title' })
  @IsOptional() @IsString() @MaxLength(STATEMENT_TITLE_MAX)
  title?: string | null;

  @ApiPropertyOptional({ maxLength: STATEMENT_TEXT_MAX, description: 'Own statement: what the team will solve' })
  @IsOptional() @IsString() @MaxLength(STATEMENT_TEXT_MAX)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  themeId?: string | null;

  @ApiPropertyOptional({ maxLength: THEME_NAME_MAX })
  @IsOptional() @IsString() @MaxLength(THEME_NAME_MAX)
  themeText?: string | null;
}
