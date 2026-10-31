import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Body for an admin free-form WhatsApp reply. */
export class WhatsAppReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  body: string;
}

/** D26: the messages to copy into the new Assist case. */
export class WhatsAppConvertToCaseDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  messageIds: string[];
}
