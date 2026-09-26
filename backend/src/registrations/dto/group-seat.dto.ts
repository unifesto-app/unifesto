import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class SeatInviteDto {
  /** Target a specific OPEN seat; omit to fill the next available OPEN seat. */
  @IsOptional()
  @IsInt()
  @Min(1)
  seatIndex?: number;

  @IsEmail()
  email: string;
}

export class InviteSeatsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SeatInviteDto)
  invites: SeatInviteDto[];
}

export class ClaimSeatDto {
  /** Member's own details answered at claim time (name/mobile/gender/customFields). */
  @IsOptional()
  @IsObject()
  memberDetails?: Record<string, unknown>;
}
