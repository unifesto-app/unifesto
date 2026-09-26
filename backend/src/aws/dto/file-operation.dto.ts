import { IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { StorageFolder } from './upload-file.dto';

export class RenameFileDto {
  @IsEnum(StorageFolder)
  @IsNotEmpty()
  folder: StorageFolder;

  @IsString()
  @IsNotEmpty()
  oldFileName: string;

  @IsString()
  @IsNotEmpty()
  newFileName: string;
}

export class DeleteFileDto {
  @IsEnum(StorageFolder)
  @IsNotEmpty()
  folder: StorageFolder;

  @IsString()
  @IsNotEmpty()
  fileName: string;
}

export class ListFilesDto {
  @IsEnum(StorageFolder)
  @IsNotEmpty()
  folder: StorageFolder;
}

export class GetFileDto {
  @IsEnum(StorageFolder)
  @IsNotEmpty()
  folder: StorageFolder;

  @IsString()
  @IsNotEmpty()
  fileName: string;
}
