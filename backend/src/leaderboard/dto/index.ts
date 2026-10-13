import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LeaderboardEntrantKind,
  LeaderboardEntrantRoundStatus,
  LeaderboardMode,
  LeaderboardTieBreak,
  LeaderboardVisibility,
} from '@prisma/client';

export class CreateLeaderboardDto {
  @ApiProperty({ enum: LeaderboardMode })
  @IsEnum(LeaderboardMode)
  mode: LeaderboardMode;

  @ApiPropertyOptional({ enum: LeaderboardEntrantKind })
  @IsOptional() @IsEnum(LeaderboardEntrantKind)
  entrantKind?: LeaderboardEntrantKind;

  @ApiPropertyOptional({ enum: LeaderboardVisibility })
  @IsOptional() @IsEnum(LeaderboardVisibility)
  visibility?: LeaderboardVisibility;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: LeaderboardTieBreak })
  @IsOptional() @IsEnum(LeaderboardTieBreak)
  tieBreak?: LeaderboardTieBreak;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  tieBreakMetricId?: string;
}

export class CreateEntrantDto {
  @ApiProperty({ maxLength: 200 })
  @IsString() @IsNotEmpty() @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Soft link to an event registration' })
  @IsOptional() @IsUUID()
  registrationId?: string;

  @ApiPropertyOptional({ description: 'Soft link to a user account' })
  @IsOptional() @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Roster / project metadata' })
  @IsOptional() @IsObject()
  meta?: Record<string, unknown>;
}

export class ScoreCellDto {
  @ApiProperty()
  @IsUUID()
  metricId: string;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ description: 'Per-criterion note (RUBRIC judges only)' })
  @IsOptional() @IsString() @MaxLength(2000)
  comment?: string;
}

/**
 * RUBRIC panelist submission for one entrant in one round. A JUDGE may send
 * `scores` (with optional per-criterion comments) and/or an `overallReview`; a
 * MENTOR may send only `overallReview` (any `scores` are rejected). `submit`
 * marks the judgment complete (`submittedAt`), which is what the curator
 * dashboard counts as "reviewed".
 */
export class SubmitJudgmentDto {
  @ApiProperty({ description: 'Round being judged' })
  @IsUUID()
  roundId: string;

  @ApiPropertyOptional({ type: [ScoreCellDto], description: 'JUDGE only' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreCellDto)
  scores?: ScoreCellDto[];

  @ApiPropertyOptional({ description: 'Overall written review' })
  @IsOptional() @IsString() @MaxLength(5000)
  overallReview?: string;

  @ApiPropertyOptional({
    description: 'Mark the review complete (sets submittedAt). Defaults to false (save draft).',
  })
  @IsOptional() @IsBoolean()
  submit?: boolean;
}

// ── Rounds ────────────────────────────────────────────────────────────────

export class CreateRoundDto {
  @ApiProperty({ maxLength: 160 })
  @IsString() @IsNotEmpty() @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ description: 'Explicit order; appended to the end when omitted' })
  @IsOptional() @IsInt() @Min(1)
  order?: number;
}

export class UpdateRoundDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160)
  name?: string;
}

// ── Panelists (judges / mentors) ────────────────────────────────────────────

// ── Manual advancement / elimination ────────────────────────────────────────

export class SetEntrantRoundStatusDto {
  @ApiProperty({ description: 'Round the decision applies to' })
  @IsUUID()
  roundId: string;

  @ApiProperty({ enum: LeaderboardEntrantRoundStatus })
  @IsEnum(LeaderboardEntrantRoundStatus)
  status: LeaderboardEntrantRoundStatus;
}

// ── Awards ──────────────────────────────────────────────────────────────────

export class CreateAwardDto {
  @ApiProperty({ description: 'Entrant receiving the award' })
  @IsUUID()
  entrantId: string;

  @ApiProperty({ maxLength: 160, description: 'e.g. "Winner", "Best Design"' })
  @IsString() @IsNotEmpty() @MaxLength(160)
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt()
  order?: number;
}

export class UpdateAwardDto {
  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  entrantId?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt()
  order?: number;
}
