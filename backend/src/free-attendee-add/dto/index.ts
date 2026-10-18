import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

  @ApiPropertyOptional({ description: 'Limit the approval to one paid ticket type (omit = any).' })
  @IsOptional()
  @IsUUID()
  ticketTypeId?: string;

  @ApiPropertyOptional({ example: 20, description: 'How many paid seats to add for free.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  seats?: number;
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

  @ApiPropertyOptional({ example: 20, description: 'Seats approved; defaults to what was requested. Required to approve when none was requested.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  approvedSeats?: number;
}

/** Platform admin withdraws an approval: no more free seats from it. */
export class RevokeFreeAddRequestDto {
  @ApiPropertyOptional({ description: 'Why it was revoked.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
