import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

const STATUSES = ['OPEN', 'CLOSED', 'DRAFT'] as const;
const APPLICATION_STATUSES = [
  'NEW',
  'REVIEWING',
  'SHORTLISTED',
  'REJECTED',
  'HIRED',
] as const;

/** Public application submission (resume arrives as a multipart file). */
export class ApplyDto {
  @IsString()
  @MaxLength(255)
  fullName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  coverLetter?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  linkedinUrl?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  portfolioUrl?: string;
}

export class UpdateApplicationDto {
  @IsIn(APPLICATION_STATUSES)
  status: (typeof APPLICATION_STATUSES)[number];
}

export class CreateCareerDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  @MaxLength(120)
  department: string;

  @IsString()
  @MaxLength(160)
  location: string;

  @IsString()
  @MaxLength(60)
  type: string;

  @IsString()
  @MaxLength(80)
  experienceLevel: string;

  @IsString()
  @MaxLength(20000)
  description: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  requirements: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  responsibilities: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  benefits: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  salaryRange?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

/** Every field optional — the admin edits any subset. */
export class UpdateCareerDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(120) department?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsString() @MaxLength(60) type?: string;
  @IsOptional() @IsString() @MaxLength(80) experienceLevel?: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  requirements?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  responsibilities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  benefits?: string[];

  @IsOptional() @IsString() @MaxLength(120) salaryRange?: string;

  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
}
