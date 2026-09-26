import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Organiser asks to be allowed to add attendees for free on one event. */
export class CreateFreeAddRequestDto {
  @ApiProperty({ example: 'event-uuid' })
  @IsUUID()
  eventId: string;

  @ApiProperty({ example: 'Comped press & sponsor passes for this event.' })
  @IsString()
  @IsNotEmpty({ message: 'A reason is required' })
  @MaxLength(1000)
  reason: string;
}

/** Platform admin's decision on a free-add request. */
export class ReviewFreeAddRequestDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Note kept with the decision.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
