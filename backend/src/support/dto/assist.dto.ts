import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** D14: the first message of an Assist bot chat. */
export class StartAssistDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  registrationId?: string;

  @IsOptional()
  @IsObject()
  clientInfo?: Record<string, unknown>;
}

/** D14: the next message in an Assist bot chat. */
export class AssistMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}
