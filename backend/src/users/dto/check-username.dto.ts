import { IsString, Matches } from 'class-validator';

export class CheckUsernameDto {
  @IsString()
  @Matches(/^[a-z0-9_]{3,50}$/, {
    message:
      'Username must be 3-50 characters, lowercase letters, numbers, and underscores only',
  })
  username: string;
}
