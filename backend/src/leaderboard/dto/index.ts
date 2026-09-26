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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LeaderboardEntrantKind,
  LeaderboardEntrantRoundStatus,
  LeaderboardMode,
  LeaderboardPanelistKind,
  LeaderboardRoundStatus,
  LeaderboardStatus,
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

export class UpdateLeaderboardDto {
  @ApiPropertyOptional({ enum: LeaderboardEntrantKind })
  @IsOptional() @IsEnum(LeaderboardEntrantKind)
  entrantKind?: LeaderboardEntrantKind;

  @ApiPropertyOptional({ enum: LeaderboardVisibility })
  @IsOptional() @IsEnum(LeaderboardVisibility)
  visibility?: LeaderboardVisibility;

  @ApiPropertyOptional({ enum: LeaderboardStatus })
  @IsOptional() @IsEnum(LeaderboardStatus)
  status?: LeaderboardStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Open written feedback to participants (their own team only). Marks are never revealed.',
  })
  @IsOptional() @IsBoolean()
  revealReviews?: boolean;

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

export class UpsertMetricDto {
  @ApiProperty({ maxLength: 80, description: 'Stable slug, unique per board' })
  @IsString() @IsNotEmpty() @MaxLength(80)
  key: string;

  @ApiProperty({ maxLength: 160 })
  @IsString() @IsNotEmpty() @MaxLength(160)
  label: string;

  @ApiPropertyOptional({ description: 'RUBRIC weight; ignored in METRIC mode' })
  @IsOptional() @IsNumber() @Min(0)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  minValue?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  maxValue?: number;

  @ApiPropertyOptional({ description: 'METRIC mode: the field entrants rank by' })
  @IsOptional() @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Scope the criterion to a round. null/omitted = board-level (all rounds).',
  })
  @IsOptional() @IsUUID()
  roundId?: string;
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

export class UpdateEntrantDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Send null to unlink', nullable: true })
  @IsOptional() @IsUUID()
  registrationId?: string | null;

  @ApiPropertyOptional({ description: 'Send null to unlink', nullable: true })
  @IsOptional() @IsUUID()
  userId?: string | null;

  @ApiPropertyOptional()
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
 * METRIC-mode organiser entry: the one authoritative value per criterion, for a
 * specific round. RUBRIC panelists use {@link SubmitJudgmentDto} instead.
 */
export class SubmitScoresDto {
  @ApiProperty({ description: 'Round these values belong to' })
  @IsUUID()
  roundId: string;

  @ApiProperty({ type: [ScoreCellDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreCellDto)
  scores: ScoreCellDto[];
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

export class AssignJudgeDto {
  @ApiProperty({ description: 'User to grant the event-scoped JUDGE role' })
  @IsUUID()
  userId: string;
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

export class ReorderRoundsDto {
  @ApiProperty({ type: [String], description: 'Round ids in the desired order' })
  @IsArray() @IsUUID('4', { each: true })
  roundIds: string[];
}

export class SetRoundStatusDto {
  @ApiProperty({ enum: LeaderboardRoundStatus })
  @IsEnum(LeaderboardRoundStatus)
  status: LeaderboardRoundStatus;
}

// ── Panelists (judges / mentors) ────────────────────────────────────────────

export class AssignPanelistDto {
  @ApiPropertyOptional({ description: 'Existing user id (provide this OR email)' })
  @IsOptional() @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Invite by email — find-or-create an account' })
  @IsOptional() @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Display name when creating a new account' })
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiProperty({ enum: LeaderboardPanelistKind })
  @IsEnum(LeaderboardPanelistKind)
  kind: LeaderboardPanelistKind;

  @ApiPropertyOptional({ description: 'Scope to one round (null = all rounds)' })
  @IsOptional() @IsUUID()
  roundId?: string;

  @ApiPropertyOptional({ description: 'Scope to one entrant (null = all entrants)' })
  @IsOptional() @IsUUID()
  entrantId?: string;
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

export class SetAwardPublishedDto {
  @ApiProperty()
  @IsBoolean()
  published: boolean;
}
