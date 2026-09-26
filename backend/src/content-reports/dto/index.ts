import { ContentReportStatus, ContentReportTarget } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateContentReportDto {
  @IsEnum(ContentReportTarget)
  targetType: ContentReportTarget;

  @IsUUID()
  targetId: string;

  @IsString()
  @MaxLength(40)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}

export class UpdateContentReportDto {
  @IsEnum(ContentReportStatus)
  status: ContentReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
