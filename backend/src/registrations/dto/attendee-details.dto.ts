import { IsBoolean, IsEmail, IsInt, IsISO8601, IsObject, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

export class AttendeeControlsDto {
  @IsOptional()
  @IsBoolean()
  allowTeamChanges?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  teamChangesUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  attendeeEditsEnabled?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  attendeeEditsUntil?: string | null;
}

export class UpdateDetailsDto {
  @IsOptional()
  @IsObject()
  formResponses?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

export class CuratorUpdateDetailsDto extends UpdateDetailsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  seatIndex?: number;
}

export class ReplaceMemberDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}
