import { IsString, IsOptional, IsUUID, IsEnum, MaxLength } from 'class-validator';

export enum SubSpaceRequestType {
  JOIN_SUPER = 'JOIN_SUPER',
  CONVERT_AND_JOIN = 'CONVERT_AND_JOIN',
  CONVERT_TO_SUPER = 'CONVERT_TO_SUPER',
  CONVERT_TO_REGULAR = 'CONVERT_TO_REGULAR',
  REMOVE_CHILD = 'REMOVE_CHILD',
  REMOVE_PARENT = 'REMOVE_PARENT',
}

/** How a request reads as an Assist case subject. */
export const SUB_SPACE_LABELS: Record<SubSpaceRequestType, string> = {
  JOIN_SUPER: 'Join a parent space',
  CONVERT_AND_JOIN: 'Make it a parent space and join it',
  CONVERT_TO_SUPER: 'Make it a parent space',
  CONVERT_TO_REGULAR: 'Make it a regular space',
  REMOVE_CHILD: 'Remove a child space',
  REMOVE_PARENT: 'Leave the parent space',
};

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
