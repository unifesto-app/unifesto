import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { SpaceVisibility, SpaceType } from '@prisma/client';

export class CreateSpaceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(SpaceVisibility)
  visibility?: SpaceVisibility;
  @IsOptional()
  @IsEnum(SpaceType)
  type?: SpaceType;

  @IsOptional()
  @IsInt()
  @Min(1)
  coCuratorLimit?: number;
}
