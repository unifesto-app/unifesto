import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const NOT_BLANK = /\S/;

export class QuizQuestionDto {
  @IsString()
  @MaxLength(300)
  @Matches(NOT_BLANK, { message: 'Question is required' })
  prompt: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Matches(NOT_BLANK, { each: true, message: 'Options cannot be blank' })
  options: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  correctIndexes: number[];

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  timeLimitSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  points?: number;
}

export class SaveQuizDto {
  @IsString()
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: 'Title is required' })
  title: string;

  @IsOptional()
  @IsBoolean()
  speedBonus?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions: QuizQuestionDto[];
}

export class AnswerQuizDto {
  @IsUUID()
  questionId: string;

  @IsInt()
  @Min(0)
  optionIndex: number;
}
