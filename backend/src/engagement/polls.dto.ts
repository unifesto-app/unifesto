import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PollResultsVisibility } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const NOT_BLANK = /\S/;

export class CreatePollDto {
  @ApiProperty({ example: 'Which talk should run next?' })
  @IsString()
  @MaxLength(300)
  @Matches(NOT_BLANK, { message: 'Question is required' })
  question: string;

  @ApiProperty({ example: ['Design systems', 'Edge AI'] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Matches(NOT_BLANK, { each: true, message: 'Options cannot be blank' })
  options: string[];

  @ApiPropertyOptional({ enum: PollResultsVisibility })
  @IsOptional()
  @IsEnum(PollResultsVisibility)
  resultsVisibility?: PollResultsVisibility;
}

export class UpdatePollDto {
  @ApiProperty({ enum: PollResultsVisibility })
  @IsEnum(PollResultsVisibility)
  resultsVisibility: PollResultsVisibility;
}

export class VotePollDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  optionIndex: number;
}
