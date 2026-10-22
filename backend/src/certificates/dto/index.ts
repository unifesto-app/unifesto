import { Type } from 'class-transformer';
import { CERTIFICATE_FONT_FAMILIES } from '../certificate-fonts';
import { IsOwnS3Url } from '../../storage/own-s3-url';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** A single positioned element (text or the verify QR) on a template. */
export class CertificateFieldDto {
  @IsIn([
    'recipientName',
    'eventTitle',
    'issueDate',
    'certificateNumber',
    'custom',
    'verifyQr',
  ])
  key:
    | 'recipientName'
    | 'eventTitle'
    | 'issueDate'
    | 'certificateNumber'
    | 'custom'
    | 'verifyQr';

  /** Static text for a `custom` field. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  label?: string;

  /** Font family — one of the bundled certificate fonts. */
  @IsOptional()
  @IsIn(CERTIFICATE_FONT_FAMILIES)
  fontFamily?: string;

  @IsNumber()
  @Min(0)
  x: number;

  @IsNumber()
  @Min(0)
  y: number;

  @IsNumber()
  @Min(1)
  @Max(1000)
  fontSize: number;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  align?: 'left' | 'center' | 'right';

  @IsOptional()
  @IsBoolean()
  bold?: boolean;

  @IsOptional()
  @IsBoolean()
  italic?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxWidth?: number;
}

export class CreateCertificateTemplateDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOwnS3Url()
  @MaxLength(2000)
  backgroundUrl: string;

  @IsInt()
  @Min(100)
  @Max(10000)
  canvasWidth: number;

  @IsInt()
  @Min(100)
  @Max(10000)
  canvasHeight: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CertificateFieldDto)
  fields: CertificateFieldDto[];
}

export class UpdateCertificateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsOwnS3Url()
  @MaxLength(2000)
  backgroundUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  canvasWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  canvasHeight?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CertificateFieldDto)
  fields?: CertificateFieldDto[];
}

/**
 * Issue a batch of certificates from a template. `audience` selects the
 * recipient set:
 *   - CHECKED_IN / CONFIRMED: resolved automatically from registrations.
 *   - MANUAL: `registrationIds` is required — the hand-picked recipients.
 */
export class IssueCertificatesDto {
  @IsUUID()
  templateId: string;

  @IsIn(['CHECKED_IN', 'CONFIRMED', 'MANUAL'])
  audience: 'CHECKED_IN' | 'CONFIRMED' | 'MANUAL';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  registrationIds?: string[];
}

export class RevokeCertificateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Copy an existing template (from another event in the same space) into this event. */
export class ImportTemplateDto {
  @IsUUID()
  sourceTemplateId: string;
}

/**
 * Resend certificate emails for an event. By default only certificates never
 * successfully emailed (`emailedAt IS NULL`) are targeted; set
 * `includeAlreadySent` to re-send to everyone who has an email on file.
 */
export class ResendCertificateEmailsDto {
  @IsOptional()
  @IsBoolean()
  includeAlreadySent?: boolean;
}
