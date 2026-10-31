import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** D20: how the requester felt about a resolved case. */
export class RateTicketDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
