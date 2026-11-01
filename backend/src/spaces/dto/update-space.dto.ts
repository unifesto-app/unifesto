import { PartialType } from '@nestjs/mapped-types';
import { CreateSpaceDto } from './create-space.dto';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { OwnerStatus } from '../space-lifecycle';

export class UpdateSpaceDto extends PartialType(CreateSpaceDto) {
  @IsOptional()
  @IsUUID()
  parentSpaceId?: string | null;
}

/** Q39: what an owner may set on their own space. */
export class SetSpaceLifecycleDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  status: OwnerStatus;
}
