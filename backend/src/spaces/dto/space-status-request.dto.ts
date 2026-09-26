import {
  IsUUID,
  IsString,
  IsIn,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class CreateSpaceStatusRequestDto {
  @IsUUID()
  spaceId: string;

  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  requestedStatus: string;

  @IsString()
  @MaxLength(1000)
  reason: string;
}

export class ReviewSpaceStatusRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
