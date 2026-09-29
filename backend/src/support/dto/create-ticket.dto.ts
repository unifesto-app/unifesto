import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsEmail,
  MaxLength,
  MinLength,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SupportTicketCategory,
  SupportTicketPriority,
} from '@prisma/client';

export class CreateTicketDto {
  @ApiProperty({ example: 'My QR ticket did not arrive' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject: string;

  @ApiProperty({
    example: 'I registered for the fest but never received my QR code…',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({ enum: SupportTicketCategory })
  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @ApiPropertyOptional({ enum: SupportTicketPriority })
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @ApiPropertyOptional({
    description: 'Space this ticket is raised from (organiser context)',
  })
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @ApiPropertyOptional({
    description: 'The app build it was raised from (version, build, runtime, update id, platform)',
  })
  @IsOptional()
  @IsObject()
  clientInfo?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'me@example.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
