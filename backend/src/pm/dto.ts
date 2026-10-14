import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PM_STATUSES } from './pm.service';
import type { PmTaskStatus } from '@prisma/client';

export class UpsertTrackDto {
  @IsString() @MaxLength(16) key: string;
  @IsString() @MaxLength(160) name: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpsertTaskDto {
  @IsString() @MaxLength(32) key: string;
  @IsOptional() @IsString() @MaxLength(16) trackKey?: string;
  @IsOptional() @IsString() @MaxLength(5000) title?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20000)
  notes?: string | null;
  @IsOptional() @IsIn(PM_STATUSES) status?: PmTaskStatus;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  owner?: string | null;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  labels?: string[];
}

export class AddNoteDto {
  @IsString() @MaxLength(5000) message: string;
  @IsOptional() @IsString() @MaxLength(32) key?: string;
}

export class CreateTokenDto {
  @IsString() @MaxLength(80) name: string;
}
