import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    example: '919848945690',
    description:
      "Recipient number. Accepts +country-code, a bare local mobile, or Meta's wa_id (digits only).",
  })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  to: string;

  @ApiProperty({
    example: 'hello_world',
    description: 'Name of the pre-approved Meta template to send.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  templateName: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Sameer'],
    description: 'Ordered body ({{1}}, {{2}}…) parameters for the template.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @MaxLength(1024, { each: true })
  bodyParams?: string[];

  @ApiPropertyOptional({
    example: 'en',
    description: "Template language code (defaults to 'en').",
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;
}
