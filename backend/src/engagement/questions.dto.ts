import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class AskQuestionDto {
  @ApiProperty({ example: 'Will the slides be shared after the talk?' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/, { message: 'Question is required' })
  text: string;

  @ApiPropertyOptional({ description: 'The agenda item (session/track) this is about' })
  @IsOptional()
  @IsUUID()
  agendaId?: string;
}

export const MODERATION_TARGETS = ['APPROVED', 'HIDDEN', 'ANSWERED'] as const;
export type ModerationTarget = (typeof MODERATION_TARGETS)[number];

export class ModerateQuestionDto {
  @ApiPropertyOptional({ enum: MODERATION_TARGETS })
  @IsOptional()
  @IsIn(MODERATION_TARGETS)
  status?: ModerationTarget;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class QaSettingsDto {
  @ApiProperty({ description: 'New questions wait for a moderator before anyone else sees them' })
  @IsBoolean()
  premoderated: boolean;
}
