import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body for an admin free-form WhatsApp reply. */
export class WhatsAppReplyDto {
  @ApiProperty({
    example: 'Hi! Thanks for reaching out — your ticket is confirmed.',
    description: 'Plain-text reply body (WhatsApp text message, max 4096 chars).',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  body: string;
}
