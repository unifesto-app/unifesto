import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export class CreateBlogDto {
  @IsString()
  @MaxLength(255)
  title: string;

  /** Optional; auto-generated from the title (and made unique) when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsString()
  @MaxLength(1000)
  excerpt: string;

  @IsString()
  @MaxLength(100000)
  content: string;

  @IsString()
  @MaxLength(80)
  category: string;

  @IsString()
  @MaxLength(120)
  author: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  coverImageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  readMinutes?: number;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional() @IsString() @MaxLength(60) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(155) metaDescription?: string;
  @IsOptional() @IsString() @MaxLength(300) coverAlt?: string;

  /** K3: a DRAFT goes live on its own at this ISO time. */
  @IsOptional() @IsDateString() scheduledFor?: string;
}

export class UpdateBlogDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(220) slug?: string;
  @IsOptional() @IsString() @MaxLength(1000) excerpt?: string;
  @IsOptional() @IsString() @MaxLength(100000) content?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(120) author?: string;
  @IsOptional() @IsUrl() @MaxLength(2000) coverImageUrl?: string;
  @IsOptional() @IsInt() @Min(1) @Max(180) readMinutes?: number;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(60) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(155) metaDescription?: string;
  @IsOptional() @IsString() @MaxLength(300) coverAlt?: string;
  /** K3: ISO time to publish a DRAFT; null clears the schedule. */
  @ValidateIf((_, v) => v !== null) @IsOptional() @IsDateString() scheduledFor?: string | null;
}

export class SearchConsoleDto {
  /** The Pages CSV from Search Console's Performance report. */
  @IsString()
  @MaxLength(2_000_000)
  csv: string;
}
