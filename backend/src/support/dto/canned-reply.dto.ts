import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';

/** D19: a saved reply. No `spaceId` = the Unifesto desk's (Platform only). */
export class CannedReplyDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}

/** Edit a saved reply's title or text (it stays on its desk). */
export class UpdateCannedReplyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body?: string;
}
