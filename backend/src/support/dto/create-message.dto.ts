import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ example: 'Thanks — I have re-sent your ticket to your email.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body: string;
}
