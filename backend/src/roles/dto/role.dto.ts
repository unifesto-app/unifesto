import { IsString, IsEnum, IsOptional, IsNotEmpty, Matches } from 'class-validator';

export enum RoleScope {
  GLOBAL = 'global',
  PLATFORM = 'platform',
  ORGANIZATION = 'organization',
  EVENT = 'event',
}

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z_]+$/, {
    message: 'Code must be uppercase letters and underscores only',
  })
  code: string;

  @IsEnum(RoleScope)
  scope: RoleScope;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z_]+$/, {
    message: 'Code must be uppercase letters and underscores only',
  })
  code?: string;

  @IsEnum(RoleScope)
  @IsOptional()
  scope?: RoleScope;

  @IsString()
  @IsOptional()
  description?: string;
}
