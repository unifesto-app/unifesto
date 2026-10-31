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
  @IsString()
  qrCode: string;

  @IsUUID()
  checkinTypeId: string;

  @IsOptional()
  @IsBoolean()
  groupAware?: boolean;
}

export class ManualCheckinDto {
  @IsUUID()
  registrationId: string;

  @IsUUID()
  checkinTypeId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  memberIndex?: number;
}

export class UndoCheckinDto {
  @IsUUID()
  registrationId: string;

  @IsUUID()
  checkinTypeId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  memberIndex?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BulkCheckinDto {
  @IsArray()
  @IsUUID('4', { each: true })
  registrationIds: string[];
}

export class GroupCheckinDto {
  @IsUUID()
  registrationId: string;

  @IsUUID()
  checkinTypeId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  memberIndexes: number[];
}

export class CreateCheckinTypeDto {
  @IsString()
  name: string;
}

export class SetCheckinAccessDto {
  @ValidateIf((o) => o.checkinTypeIds !== 'ALL')
  @IsArray()
  @IsUUID('4', { each: true })
  checkinTypeIds: string[] | 'ALL';
}

/** One check-in recorded on a device while it was offline. */
export class OfflineCheckinItemDto {
  @IsString()
  @MaxLength(64)
  id: string;

  @IsUUID()
  registrationId: string;

  @IsUUID()
  checkinTypeId: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  memberIndexes?: number[];

  @IsDateString()
  scannedAt: string;
}

export class SyncOfflineCheckinsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OfflineCheckinItemDto)
  items: OfflineCheckinItemDto[];
}
