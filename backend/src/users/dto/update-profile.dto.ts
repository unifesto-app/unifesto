import {
  IsString,
  IsOptional,
  IsUrl,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{3,50}$/, {
    message:
      'Username must be 3-50 characters, lowercase letters, numbers, and underscores only',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'])
  gender?: string;

  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @IsOptional()
  @IsUrl()
  instagramUrl?: string;

  @IsOptional()
  @IsUrl()
  githubUrl?: string;

  @IsOptional()
  @IsUrl()
  websiteUrl?: string;
}
