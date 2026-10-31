import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body for starting a new WhatsApp conversation from Apex. Initiating contact
 * (outside the 24h window) must use a pre-approved template, so the caller picks
 * a template name and supplies its body parameters.
 */
export class WhatsAppInitiateDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  to: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  templateName: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @MaxLength(1024, { each: true })
  bodyParams?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;
}
