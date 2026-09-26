import { PartialType } from '@nestjs/mapped-types';
import { CreateSpaceDto } from './create-space.dto';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { SpaceStatus } from '@prisma/client';

export class UpdateSpaceDto extends PartialType(CreateSpaceDto) {
  @IsOptional()
  @IsUUID()
  parentSpaceId?: string | null;
}

export class UpdateSpaceStatusDto {
  @IsEnum(SpaceStatus)
  status: SpaceStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
