import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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

/** D26: the messages to copy into the new Assist case. */
export class WhatsAppConvertToCaseDto {
  @ApiProperty({ type: [String], description: 'Message ids from this conversation, in any order.' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  messageIds: string[];
}
