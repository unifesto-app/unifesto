import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** D19: a saved reply. No `spaceId` = the Unifesto desk's (Platform only). */
export class CannedReplyDto {
  @ApiPropertyOptional({ description: "The space desk it belongs to; leave out for Unifesto's" })
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @ApiProperty({ example: 'Ticket not received' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: 'Your ticket is in the app under My tickets. Pull down to refresh if it is not there yet.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}

/** Edit a saved reply's title or text (it stays on its desk). */
export class UpdateCannedReplyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body?: string;
}
