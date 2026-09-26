import { IsString, IsOptional, IsUUID, IsEnum, MaxLength } from 'class-validator';

export enum SubSpaceRequestType {
  JOIN_SUPER = 'JOIN_SUPER',
  CONVERT_AND_JOIN = 'CONVERT_AND_JOIN',
  CONVERT_TO_SUPER = 'CONVERT_TO_SUPER',
  CONVERT_TO_REGULAR = 'CONVERT_TO_REGULAR',
  REMOVE_CHILD = 'REMOVE_CHILD',
  REMOVE_PARENT = 'REMOVE_PARENT',
}

export class CreateSubSpaceRequestDto {
  @IsEnum(SubSpaceRequestType)
  requestType: SubSpaceRequestType;

  // Required for JOIN_SUPER, CONVERT_AND_JOIN, REMOVE_CHILD, REMOVE_PARENT.
  // For REMOVE_CHILD/REMOVE_PARENT this is the child space being detached.
  @IsOptional()
  @IsUUID()
  subSpaceId?: string;

  @IsUUID()
  targetSpaceId: string; // required for all types

  @IsString()
  @MaxLength(1000)
  reason: string;
}

export class ReviewSubSpaceRequestDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
