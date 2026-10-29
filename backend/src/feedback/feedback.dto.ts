import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitFeedbackDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, description: 'How likely to recommend (NPS)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  nps?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;

  @ApiPropertyOptional({ description: "Answers to the curators' questions, keyed by question id" })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class FeedbackSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: "Hold attendees' certificates until they give feedback (F2)" })
  @IsOptional()
  @IsBoolean()
  unlocksCertificate?: boolean;

  @ApiPropertyOptional({ description: 'Show the average rating on the public event page once 5+ have rated (F3)' })
  @IsOptional()
  @IsBoolean()
  public?: boolean;
}
