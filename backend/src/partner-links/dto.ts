import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePartnerLinkDto {
  @ApiProperty({ example: 'Oqens' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({
    example: 'lead@oqens.org',
    description: "The partner contact's Unifesto account email. They see the stats in the app.",
  })
  @IsEmail()
  email: string;
}
