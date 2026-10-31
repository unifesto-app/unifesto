import { IsBoolean, IsInt, IsOptional, Max, Min, IsArray, IsIn, ArrayUnique } from 'class-validator';
import { AI_FEATURE_KEYS } from '../../ai/ai-features';

// The app-wide processing fee is fixed platform-wide (see PROCESSING_FEE_PERCENT)
// and is intentionally not part of this DTO — it can no longer be set by admins.
export class UpdatePlatformConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  postEventActionWindowDays?: number;

  @IsOptional()
  @IsBoolean()
  appReviewLoginEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAgeConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  customSendingDomainsEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(AI_FEATURE_KEYS, { each: true })
  aiEnabledFeatures?: string[];
}
