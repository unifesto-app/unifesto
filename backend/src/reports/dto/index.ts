import { Type } from 'class-transformer';
import { ReportSection, ReportType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Request a new event report.
 *
 * `type` picks the shape:
 *   - DEFAULT: the full report — every section. `sections` is ignored.
 *   - CUSTOM:  only the sections in `sections` (see resolveSections()).
 *
 * `dateFrom` / `dateTo` optionally bound the time-based sections (attendees,
 * check-ins, revenue) to a reporting window; omitted = the event's lifetime.
 */
export class CreateReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  /** Sections to include. Required (non-empty) only when type is CUSTOM. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsEnum(ReportSection, { each: true })
  sections?: ReportSection[];

  /** Optional human title; a sensible default is generated when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

/** Narrow query for the history list. */
export class ListReportsQueryDto {
  @IsOptional()
  @IsIn(['DEFAULT', 'CUSTOM'])
  type?: 'DEFAULT' | 'CUSTOM';
}
