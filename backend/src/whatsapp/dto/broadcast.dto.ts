import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Who a platform WhatsApp broadcast goes to.
 *   ALL   — every user in the app that has a mobile number (marketing
 *           templates: only those who opted in to promotions).
 *   SPACE — the members of one Space (space-scoped roles, event roles excluded).
 *   USER  — one or more explicitly chosen users.
 *   STAFF — platform ADMINs only (test sends).
 */
export enum WhatsAppBroadcastAudience {
  ALL = 'ALL',
  SPACE = 'SPACE',
  USER = 'USER',
  STAFF = 'STAFF',
}

/**
 * Body for `POST /admin/whatsapp/broadcast` — send a pre-approved template to a
 * chosen audience. Reaching people cold (outside Meta's 24h window) is only
 * possible with an approved template, so the caller always picks a template and
 * supplies its body parameters. Parameters may contain the token `{name}`, which
 * is replaced per-recipient with that user's name (see the service).
 */
export class WhatsAppBroadcastDto {
  @ApiProperty({ enum: WhatsAppBroadcastAudience })
  @IsEnum(WhatsAppBroadcastAudience)
  audience: WhatsAppBroadcastAudience;

  @ApiPropertyOptional({
    description: 'Required when audience=SPACE — the Space whose members receive the blast.',
  })
  @ValidateIf((o) => o.audience === WhatsAppBroadcastAudience.SPACE)
  @IsUUID()
  spaceId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required when audience=USER — the users to message.',
  })
  @ValidateIf((o) => o.audience === WhatsAppBroadcastAudience.USER)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @ApiProperty({
    example: 'unifesto_confirm_spot',
    description: 'Name of the pre-approved Meta template to send.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  templateName: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['{name}', 'Open Source Sprint'],
    description:
      'Ordered body ({{1}}, {{2}}…) parameters. "{name}" anywhere in a value is replaced per-recipient with the user\'s name.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @MaxLength(1024, { each: true })
  bodyParams?: string[];

  @ApiPropertyOptional({ example: 'en', description: "Template language (defaults to 'en')." })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;
}

/**
 * Who a broadcast would reach, for the count on the confirm step. Pass the
 * template too: a marketing one only reaches people who opted in to promotions
 * (without it the count assumes marketing, the smaller number).
 */
export class WhatsAppAudienceDto extends IntersectionType(
  PickType(WhatsAppBroadcastDto, ['audience', 'spaceId', 'userIds'] as const),
  PartialType(PickType(WhatsAppBroadcastDto, ['templateName', 'languageCode'] as const)),
) {}

/** A template to send to the signed-in admin's own number only. */
export class WhatsAppBroadcastTestDto extends PickType(WhatsAppBroadcastDto, [
  'templateName',
  'bodyParams',
  'languageCode',
] as const) {}
