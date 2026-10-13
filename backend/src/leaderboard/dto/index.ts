import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LeaderboardEntrantRoundStatus,
} from '@prisma/client';

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

// ── Manual advancement / elimination ────────────────────────────────────────

export class SetEntrantRoundStatusDto {
  @ApiProperty({ description: 'Round the decision applies to' })
  @IsUUID()
  roundId: string;

  @ApiProperty({ enum: LeaderboardEntrantRoundStatus })
  @IsEnum(LeaderboardEntrantRoundStatus)
  status: LeaderboardEntrantRoundStatus;
}
