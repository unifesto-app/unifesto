import {
  HackathonAnnouncementAudience,
  HackathonHelpQueryStatus,
  HackathonJudgingMode,
  HackathonPsMode,
  HackathonRoundKind,
  LeaderboardPanelistKind,
  HackathonScoringMode,
  HackathonThemeMode,
  LeaderboardEntrantRoundStatus,
  LeaderboardRoundStatus,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CALL_GRACE_MINUTES_MAX,
  REQUIRED_EVALUATIONS_MAX,
  SLOT_MINUTES_MAX,
  STATEMENT_CODE_MAX,
  SUBMISSION_LABEL_MAX,
  SUBMISSION_LINKS_MAX,
  SUBMISSION_NOTES_MAX,
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
  @IsOptional() @IsString() @MaxLength(20)
  teamCodePrefix?: string | null;

  @IsOptional() @IsInt() @Min(TEAM_CODE_DIGITS_MIN) @Max(TEAM_CODE_DIGITS_MAX)
  teamCodeDigits?: number;

  @IsOptional() @IsInt() @Min(1) @Max(999999)
  teamCodeNext?: number;

  @IsOptional() @IsUUID()
  teamNameFieldId?: string | null;

  @IsOptional() @IsString() @MaxLength(255)
  venueName?: string | null;

  @IsOptional() @IsString() @MaxLength(1000)
  venueAddress?: string | null;

  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  venueLat?: number | null;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  venueLng?: number | null;

  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2000)
  venueMapUrl?: string | null;

  @IsOptional() @IsString() @MaxLength(1000)
  venueNotes?: string | null;

  @IsOptional() @IsEnum(HackathonPsMode)
  psMode?: HackathonPsMode | null;

  @IsOptional() @IsEnum(HackathonThemeMode)
  themeMode?: HackathonThemeMode;

  @IsOptional() @IsDateString()
  psDeadline?: string | null;

  @IsOptional() @IsEnum(HackathonScoringMode)
  scoringMode?: HackathonScoringMode;

  @IsOptional() @IsBoolean()
  revealReviews?: boolean;
}

export class ImportHackathonTeamsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true })
  ticketTypeIds?: string[];
}

export class UpdateHackathonTeamDto {
  @IsOptional() @IsString() @MaxLength(40)
  teamCode?: string;

  @IsOptional() @IsString() @MaxLength(TEAM_NAME_MAX)
  name?: string;

  @IsOptional() @IsUUID()
  roomId?: string | null;
}

export class RenameMyTeamDto {
  @IsString() @IsNotEmpty() @MaxLength(TEAM_NAME_MAX)
  name: string;
}

export class CreateHackathonRoomDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string | null;

  @IsInt() @Min(1) @Max(10000)
  capacity: number;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string | null;

  @IsOptional() @IsInt() @Min(0)
  order?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true })
  volunteerUserIds?: string[];
}

export class UpdateHackathonRoomDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string | null;

  @IsOptional() @IsInt() @Min(1) @Max(10000)
  capacity?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string | null;

  @IsOptional() @IsInt() @Min(0)
  order?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true })
  volunteerUserIds?: string[];
}

// ── Problem statements & themes ──────────────────────────────────────────────

export class CreateHackathonThemeDto {
  @IsString() @IsNotEmpty() @MaxLength(THEME_NAME_MAX)
  name: string;

  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class UpdateHackathonThemeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(THEME_NAME_MAX)
  name?: string;

  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class CreateHackathonStatementDto {
  @IsOptional() @IsString() @MaxLength(STATEMENT_CODE_MAX)
  code?: string | null;

  @IsString() @IsNotEmpty() @MaxLength(STATEMENT_TITLE_MAX)
  title: string;

  @IsString() @MaxLength(STATEMENT_TEXT_MAX)
  description: string;

  @IsOptional() @IsUUID()
  themeId?: string | null;

  @IsOptional() @IsInt() @Min(1) @Max(10000)
  maxTeams?: number | null;

  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class UpdateHackathonStatementDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(STATEMENT_CODE_MAX)
  code?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(STATEMENT_TITLE_MAX)
  title?: string;

  @IsOptional() @IsString() @MaxLength(STATEMENT_TEXT_MAX)
  description?: string;

  @IsOptional() @IsUUID()
  themeId?: string | null;

  @IsOptional() @IsInt() @Min(1) @Max(10000)
  maxTeams?: number | null;

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
  @IsOptional() @IsUUID()
  statementId?: string | null;

  @IsOptional() @IsString() @MaxLength(STATEMENT_TITLE_MAX)
  title?: string | null;

  @IsOptional() @IsString() @MaxLength(STATEMENT_TEXT_MAX)
  description?: string | null;

  @IsOptional() @IsUUID()
  themeId?: string | null;

  @IsOptional() @IsString() @MaxLength(THEME_NAME_MAX)
  themeText?: string | null;
}

// ── Rounds & criteria ────────────────────────────────────────────────────────

/** A hackathon round's settings. On create only `name` is required. */
export class UpdateHackathonRoundDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160)
  name?: string;

  @IsOptional() @IsEnum(HackathonRoundKind)
  kind?: HackathonRoundKind;

  @IsOptional() @IsEnum(HackathonJudgingMode)
  judgingMode?: HackathonJudgingMode;

  @IsOptional() @IsInt() @Min(1) @Max(REQUIRED_EVALUATIONS_MAX)
  requiredEvaluations?: number;

  @IsOptional() @IsInt() @Min(1) @Max(SLOT_MINUTES_MAX)
  slotMinutes?: number;

  @IsOptional() @IsInt() @Min(0) @Max(CALL_GRACE_MINUTES_MAX)
  callGraceMinutes?: number;

  @IsOptional() @IsBoolean()
  eliminationEnabled?: boolean;

  @IsOptional() @IsBoolean()
  countsTowardTotal?: boolean;

  @IsOptional() @IsDateString()
  endAt?: string | null;

  @IsOptional() @IsDateString()
  submissionsCloseAt?: string | null;
}

/** Same fields; the service requires `name`. */
export class CreateHackathonRoundDto extends UpdateHackathonRoundDto {}

export class SetHackathonRoundStatusDto {
  @IsEnum(LeaderboardRoundStatus)
  status: LeaderboardRoundStatus;
}

export class UpsertCriterionDto {
  @IsString() @IsNotEmpty() @MaxLength(160)
  label: string;

  @IsNumber() @Min(1) @Max(1000)
  maxValue: number;

  @IsOptional() @IsNumber() @Min(0.1) @Max(100)
  weight?: number;
}

export class SetTeamRoundDecisionDto {
  @IsEnum(LeaderboardEntrantRoundStatus)
  status: LeaderboardEntrantRoundStatus;
}

// ── Judges & panels ──────────────────────────────────────────────────────────

class JudgeFieldsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true })
  themeIds?: string[];

  @IsOptional() @IsString() @MaxLength(200)
  location?: string | null;

  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2000)
  meetingUrl?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true })
  roundIds?: string[] | null;
}

/** Add a judge by phone number or email: an existing account, or one that links when they sign in. */
export class AddHackathonJudgeDto extends JudgeFieldsDto {
  @IsOptional() @IsString() @MaxLength(20)
  mobile?: string;

  @IsOptional() @IsString() @MaxLength(320)
  email?: string;

  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @IsOptional() @IsEnum(LeaderboardPanelistKind)
  kind?: LeaderboardPanelistKind;
}

export class UpdateHackathonJudgeDto extends JudgeFieldsDto {
  @IsOptional() @IsBoolean()
  isAvailable?: boolean;
}

export class UpdateHackathonPanelDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @IsOptional() @IsUUID()
  roundId?: string | null;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string | null;

  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2000)
  meetingUrl?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true })
  memberUserIds?: string[];

  @IsOptional() @IsBoolean()
  isAvailable?: boolean;
}

/** Same fields; the service requires `name`. */
export class CreateHackathonPanelDto extends UpdateHackathonPanelDto {}

// ── Queue ────────────────────────────────────────────────────────────────────

/** Finishing a slot nobody marked needs it said out loud: the team didn't turn up. */
export class ForceCompleteDto {
  @IsOptional() @IsBoolean()
  noShow?: boolean;
}

/** A judge (SINGLE / MULTI rounds) or a panel (PANEL rounds). */
export class PickEvaluatorDto {
  @IsOptional() @IsUUID()
  judgeUserId?: string;

  @IsOptional() @IsUUID()
  panelId?: string;
}

export class JudgeAvailabilityDto {
  @IsBoolean()
  isAvailable: boolean;
}

export class CallNextDto {
  @IsOptional() @IsUUID()
  panelId?: string;
}

// ── Results & winners (Phase 4) ──────────────────────────────────────────────

class TeamDecisionDto {
  @IsUUID()
  entrantId: string;

  @IsEnum(LeaderboardEntrantRoundStatus)
  status: LeaderboardEntrantRoundStatus;
}

/** Several advance/eliminate decisions at once (the "top N" helper). */
export class SetRoundDecisionsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => TeamDecisionDto)
  decisions: TeamDecisionDto[];
}

export class UpdateHackathonAwardDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160)
  title?: string;

  @IsOptional() @IsUUID()
  entrantId?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string | null;

  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

/** Same fields; the service requires `title` and `entrantId`. */
export class CreateHackathonAwardDto extends UpdateHackathonAwardDto {}

export class PublishAwardsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true })
  awardIds?: string[];
}

// ── Project links & announcements (Phase 5) ──────────────────────────────────

class SubmissionLinkDto {
  @IsOptional() @IsString() @MaxLength(SUBMISSION_LABEL_MAX)
  label?: string;

  @IsString() @MaxLength(2000)
  url: string;
}

export class SaveSubmissionDto {
  @IsArray() @ArrayMaxSize(SUBMISSION_LINKS_MAX + 5)
  @ValidateNested({ each: true }) @Type(() => SubmissionLinkDto)
  links: SubmissionLinkDto[];

  @IsOptional() @IsString() @MaxLength(SUBMISSION_NOTES_MAX)
  notes?: string | null;
}

export class SendAnnouncementDto {
  @IsEnum(HackathonAnnouncementAudience)
  audience: HackathonAnnouncementAudience;

  @IsOptional() @IsUUID()
  roomId?: string;

  @IsString() @IsNotEmpty() @MaxLength(120)
  title: string;

  @IsString() @IsNotEmpty() @MaxLength(2000)
  body: string;
}

// ── Help desk ────────────────────────────────────────────────────────────────

export class CreateHelpTopicDto {
  @IsString() @IsNotEmpty() @MaxLength(60)
  name: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true })
  pocUserIds?: string[];
}

export class UpdateHelpTopicDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(60)
  name?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true })
  pocUserIds?: string[];
}

export class RaiseHelpQueryDto {
  @IsOptional() @IsUUID()
  topicId?: string | null;

  @IsString() @IsNotEmpty() @MaxLength(1000)
  message: string;
}

export class SetHelpQueryStatusDto {
  @IsEnum(HackathonHelpQueryStatus)
  status: HackathonHelpQueryStatus;
}

// ── Certificates (Phase 6) ───────────────────────────────────────────────────

export class IssueHackathonCertificatesDto {
  @IsUUID()
  templateId: string;

  @IsEnum(['PARTICIPANTS', 'WINNERS'])
  audience: 'PARTICIPANTS' | 'WINNERS';
}
