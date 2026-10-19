import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsUUID,
  IsOptional,
  ValidateIf,
  IsInt,
  Min,
  ArrayNotEmpty,
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScanQRCodeDto {
  @ApiProperty({ example: 'qr-code-hash' })
  @IsString()
  qrCode: string;

  @ApiProperty({ example: 'checkin-type-uuid', description: 'Check-in point.' })
  @IsUUID()
  checkinTypeId: string;

  @ApiPropertyOptional({
    description:
      'Client understands the group-roster response. When true, scanning a ' +
      'group QR returns its members to check in individually instead of ' +
      'checking the whole group in. Older clients omit it and every claimed ' +
      'member is checked in.',
  })
  @IsOptional()
  @IsBoolean()
  groupAware?: boolean;
}

export class ManualCheckinDto {
  @ApiProperty({ example: 'registration-uuid' })
  @IsUUID()
  registrationId: string;

  @ApiProperty({ example: 'checkin-type-uuid' })
  @IsUUID()
  checkinTypeId: string;

  @ApiPropertyOptional({
    description:
      'Group registrations: the member (0-based, seat - 1) to check in. ' +
      'Omitted on a group means the lead (member 0).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  memberIndex?: number;
}

export class UndoCheckinDto {
  @ApiProperty({ example: 'registration-uuid' })
  @IsUUID()
  registrationId: string;

  @ApiProperty({ example: 'checkin-type-uuid' })
  @IsUUID()
  checkinTypeId: string;

  @ApiPropertyOptional({
    description: 'Group registrations: the member (0-based, seat - 1) whose check-in to undo.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  memberIndex?: number;

  @ApiPropertyOptional({ description: 'Why it was undone, kept on the audit trail.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BulkCheckinDto {
  @ApiProperty({ example: ['reg-uuid-1', 'reg-uuid-2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  registrationIds: string[];
}

export class GroupCheckinDto {
  @ApiProperty({ example: 'registration-uuid' })
  @IsUUID()
  registrationId: string;

  @ApiProperty({ example: 'checkin-type-uuid' })
  @IsUUID()
  checkinTypeId: string;

  @ApiProperty({
    example: [0, 2],
    description: 'Member indexes (seat index - 1) to check in.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  memberIndexes: number[];
}

export class CreateCheckinTypeDto {
  @ApiProperty({ example: 'Lunch' })
  @IsString()
  name: string;
}

export class SetCheckinAccessDto {
  @ApiProperty({
    description: 'Check-in point ids to grant, or the string "ALL" for every point.',
    example: ['type-uuid-1', 'type-uuid-2'],
  })
  @ValidateIf((o) => o.checkinTypeIds !== 'ALL')
  @IsArray()
  @IsUUID('4', { each: true })
  checkinTypeIds: string[] | 'ALL';
}

// Kept for compatibility with any older callers.
export class GrantCheckinAccessDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ example: 'checkin-type-uuid' })
  @IsOptional()
  @IsUUID()
  checkinTypeId?: string;
}

/** One check-in recorded on a device while it was offline. */
export class OfflineCheckinItemDto {
  @ApiProperty({ description: 'Client-generated id, echoed back in the result.' })
  @IsString()
  @MaxLength(64)
  id: string;

  @ApiProperty({ example: 'registration-uuid' })
  @IsUUID()
  registrationId: string;

  @ApiProperty({ example: 'checkin-type-uuid' })
  @IsUUID()
  checkinTypeId: string;

  @ApiPropertyOptional({
    example: [0, 2],
    description: 'Group members checked in; omit for an individual check-in.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  memberIndexes?: number[];

  @ApiProperty({ description: 'When the scan happened on the device (ISO 8601).' })
  @IsDateString()
  scannedAt: string;
}

export class SyncOfflineCheckinsDto {
  @ApiProperty({ type: [OfflineCheckinItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OfflineCheckinItemDto)
  items: OfflineCheckinItemDto[];
}
