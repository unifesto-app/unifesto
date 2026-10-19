import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'Which planet is closest to the sun?' })
  @IsString()
  @MaxLength(300)
  @Matches(NOT_BLANK, { message: 'Question is required' })
  prompt: string;

  @ApiProperty({ example: ['Mercury', 'Venus', 'Mars'] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Matches(NOT_BLANK, { each: true, message: 'Options cannot be blank' })
  options: string[];

  @ApiProperty({
    example: [0],
    description: 'Indexes of the right option(s); any one of them scores.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  correctIndexes: number[];

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  timeLimitSec?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  points?: number;
}

export class SaveQuizDto {
  @ApiProperty({ example: 'Space trivia' })
  @IsString()
  @MaxLength(200)
  @Matches(NOT_BLANK, { message: 'Title is required' })
  title: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  speedBonus?: boolean;

  @ApiProperty({ type: [QuizQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions: QuizQuestionDto[];
}

export class AnswerQuizDto {
  @ApiProperty({
    description:
      'The question being answered, so a stale screen cannot answer the next one.',
  })
  @IsUUID()
  questionId: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  optionIndex: number;
}
