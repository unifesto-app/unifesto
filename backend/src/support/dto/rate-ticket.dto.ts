import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** D20: how the requester felt about a resolved case. */
export class RateTicketDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Sorted in an hour, thanks' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
