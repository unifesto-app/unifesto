import { IsEmail, IsString, IsOptional, MinLength, IsIn, IsBoolean } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(['attendee', 'organizer', 'admin', 'super_admin', 'support'])
  role?: string = 'attendee';

  @IsOptional()
  @IsBoolean()
  is_active?: boolean = true;
}
