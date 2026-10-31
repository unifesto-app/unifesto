import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class AskQuestionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/, { message: 'Question is required' })
  text: string;

  @IsOptional()
  @IsUUID()
  agendaId?: string;
}

export const MODERATION_TARGETS = ['APPROVED', 'HIDDEN', 'ANSWERED'] as const;
export type ModerationTarget = (typeof MODERATION_TARGETS)[number];

export class ModerateQuestionDto {
  @IsOptional()
  @IsIn(MODERATION_TARGETS)
  status?: ModerationTarget;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class QaSettingsDto {
  @IsBoolean()
  premoderated: boolean;
}
