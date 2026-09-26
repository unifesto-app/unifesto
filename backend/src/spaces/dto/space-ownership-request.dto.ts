import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSpaceOwnershipRequestDto {
  @IsUUID()
  spaceId: string;

  /** The member to hand the space to. Must already belong to the space. */
  @IsUUID()
  newOwnerId: string;

  @IsString()
  @MaxLength(1000)
  reason: string;
}

export class ReviewSpaceOwnershipRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
