import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Create a reusable email template (scope is decided by the controller). */
export class CreateTemplateDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(500)
  subject!: string;

  @IsString()
  body!: string;

  /** Declared merge variables, e.g. ["firstName","eventName"]. Advisory. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}

/** Partial update to a template. Every field is optional. */
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}
