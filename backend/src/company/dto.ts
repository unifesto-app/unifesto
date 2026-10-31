import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CompanyItemCategory,
  CompanyItemStatus,
  CompanyRecurrence,
} from '@prisma/client';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class UpsertCompanyItemDto {
  /** Omit to create. */
  @IsOptional() @IsInt() @Min(1) number?: number;
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsEnum(CompanyItemCategory) category?: CompanyItemCategory;
  @IsOptional() @IsEnum(CompanyItemStatus) status?: CompanyItemStatus;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DAY)
  dueDate?: string | null;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  ownerId?: string | null;
  @IsOptional() @IsBoolean() restricted?: boolean;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DAY)
  filedOn?: string | null;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  reference?: string | null;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20000)
  notes?: string | null;
  @IsOptional() @IsEnum(CompanyRecurrence) recurrence?: CompanyRecurrence;
}

export class AddCompanyNoteDto {
  @IsString() @MaxLength(5000) message: string;
}
