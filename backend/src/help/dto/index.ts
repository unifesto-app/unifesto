import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export class CreateHelpArticleDto {
  @IsString()
  @MaxLength(255)
  title: string;

  /** Optional; auto-generated from the title (and made unique) when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  /** Markdown. */
  @IsString()
  @MaxLength(100000)
  body: string;

  @IsString()
  @MaxLength(80)
  category: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class UpdateHelpArticleDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(220) slug?: string;
  @IsOptional() @IsString() @MaxLength(100000) body?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
}
