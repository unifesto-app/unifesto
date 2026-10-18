import { IsString, IsNotEmpty, MinLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ example: 'Thanks — I have re-sent your ticket to your email.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body: string;

  @ApiPropertyOptional({ description: 'Desk-only note, never shown to or sent to the requester' })
  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}
