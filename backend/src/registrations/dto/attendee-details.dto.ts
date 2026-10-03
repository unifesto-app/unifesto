import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsInt, IsISO8601, IsObject, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

export class AttendeeControlsDto {
  @ApiPropertyOptional({ description: 'Team leads may replace a filled member seat' })
  @IsOptional()
  @IsBoolean()
  allowTeamChanges?: boolean;

  @ApiPropertyOptional({ description: 'Team changes close at this time; null = open until the event ends', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  teamChangesUntil?: string | null;

  @ApiPropertyOptional({ description: 'Attendees may edit their own registration details' })
  @IsOptional()
  @IsBoolean()
  attendeeEditsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Edits close at this time; null = no deadline', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  attendeeEditsUntil?: string | null;
}

export class UpdateDetailsDto {
  @ApiPropertyOptional({ description: "Registration-level answers (a solo attendee's, or the team's)" })
  @IsOptional()
  @IsObject()
  formResponses?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "A group member's name" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: "A group member's own answers" })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

export class CuratorUpdateDetailsDto extends UpdateDetailsDto {
  @ApiPropertyOptional({ description: 'Group seat to edit (for name / customFields)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  seatIndex?: number;
}

export class ReplaceMemberDto {
  @ApiPropertyOptional({ description: 'Invite this email into the freed seat; omit to leave it open' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
