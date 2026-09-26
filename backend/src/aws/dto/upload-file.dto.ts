import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';

export enum StorageFolder {
  AVATARS = 'avatars',
  SPACE_LOGOS = 'space-logos',
  SPACE_BANNERS = 'space-banners',
}

export class UploadFileDto {
  @IsEnum(StorageFolder)
  @IsNotEmpty()
  folder: StorageFolder;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsString()
  @IsOptional()
  contentType?: string;
}

export class GetPresignedUrlDto {
  @IsEnum(StorageFolder)
  @IsNotEmpty()
  folder: StorageFolder;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsOptional()
  contentType?: string;
}
