import { PartialType } from '@nestjs/mapped-types';
import { FormFieldType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SubmitFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  nps?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;

  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class FeedbackSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  unlocksCertificate?: boolean;

  @IsOptional()
  @IsBoolean()
  public?: boolean;
}

/** A feedback form question. */
export class QuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @IsEnum(FormFieldType)
  type: FormFieldType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  helpText?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  config?: Record<string, unknown> | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  showIf?: { fieldId: string; anyOf: string[] } | null;
}

export class UpdateQuestionDto extends PartialType(QuestionDto) {}
