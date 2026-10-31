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
  @IsUUID()
  eventId: string;

  @IsString()
  @IsNotEmpty({ message: 'A reason is required' })
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsUUID()
  ticketTypeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  seats?: number;
}

/** Platform admin's decision on a free-add request. */
export class ReviewFreeAddRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  approvedSeats?: number;
}

/** Platform admin withdraws an approval: no more free seats from it. */
export class RevokeFreeAddRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
