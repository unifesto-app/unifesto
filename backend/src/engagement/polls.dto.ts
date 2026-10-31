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
  @IsString()
  @MaxLength(300)
  @Matches(NOT_BLANK, { message: 'Question is required' })
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @Matches(NOT_BLANK, { each: true, message: 'Options cannot be blank' })
  options: string[];

  @IsOptional()
  @IsEnum(PollResultsVisibility)
  resultsVisibility?: PollResultsVisibility;
}

export class UpdatePollDto {
  @IsEnum(PollResultsVisibility)
  resultsVisibility: PollResultsVisibility;
}

export class VotePollDto {
  @IsInt()
  @Min(0)
  optionIndex: number;
}
