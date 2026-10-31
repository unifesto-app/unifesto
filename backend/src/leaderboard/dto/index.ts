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
  @IsUUID()
  metricId: string;

  @IsNumber()
  value: number;

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
  @IsUUID()
  roundId: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreCellDto)
  scores?: ScoreCellDto[];

  @IsOptional() @IsString() @MaxLength(5000)
  overallReview?: string;

  @IsOptional() @IsBoolean()
  submit?: boolean;
}

// ── Rounds ────────────────────────────────────────────────────────────────

export class CreateRoundDto {
  @IsString() @IsNotEmpty() @MaxLength(160)
  name: string;

  @IsOptional() @IsInt() @Min(1)
  order?: number;
}

// ── Manual advancement / elimination ────────────────────────────────────────

export class SetEntrantRoundStatusDto {
  @IsUUID()
  roundId: string;

  @IsEnum(LeaderboardEntrantRoundStatus)
  status: LeaderboardEntrantRoundStatus;
}
