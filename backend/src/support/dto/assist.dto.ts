import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** D14: the first message of an Assist bot chat. */
export class StartAssistDto {
  @ApiProperty({ example: 'Can I still get a refund for my workshop ticket?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @ApiPropertyOptional({ description: 'Event the chat is about' })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ description: "Requester's own registration the chat is about" })
  @IsOptional()
  @IsUUID()
  registrationId?: string;

  @ApiPropertyOptional({ description: 'The app build it was raised from' })
  @IsOptional()
  @IsObject()
  clientInfo?: Record<string, unknown>;
}

/** D14: the next message in an Assist bot chat. */
export class AssistMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}
