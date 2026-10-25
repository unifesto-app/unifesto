import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min, IsArray, IsIn, ArrayUnique } from 'class-validator';
import { AI_FEATURE_KEYS } from '../../ai/ai-features';

// The app-wide processing fee is fixed platform-wide (see PROCESSING_FEE_PERCENT)
// and is intentionally not part of this DTO — it can no longer be set by admins.
export class UpdatePlatformConfigDto {
  @ApiProperty({
    example: 7,
    description:
      'Days after an event ends that organisers may still issue certificates ' +
      'and import/add attendees (0-365). 0 closes these actions the moment the ' +
      'event ends.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  postEventActionWindowDays?: number;

  @ApiProperty({
    example: false,
    description:
      'Allow the fixed App Review test login (store review only; keep off otherwise).',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  appReviewLoginEnabled?: boolean;

  @ApiProperty({
    example: false,
    description:
      'Refuse self-registration until the user confirmed they are 18 or older ' +
      '(Z11). Keep off until most attendees run app 5.0.0+.',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  requireAgeConfirmation?: boolean;

  @ApiProperty({
    example: false,
    description:
      'Let spaces add their own email sending domain (H20). Keep off until ' +
      'the Resend plan allows more than one domain.',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  customSendingDomainsEnabled?: boolean;

  @ApiProperty({
    example: ['blog_writer'],
    description: 'The AI features allowed to run; anything left out is off.',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(AI_FEATURE_KEYS, { each: true })
  aiEnabledFeatures?: string[];
}
