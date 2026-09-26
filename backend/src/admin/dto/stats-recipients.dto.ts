import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateStatsRecipientsDto {
  @ApiProperty({
    example: ['+919848945690', '8520045690'],
    description:
      'Full replacement list of WhatsApp numbers for the Unifesto Stats broadcast. A bare 10-digit number is taken as Indian (+91).',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  numbers: string[];
}
