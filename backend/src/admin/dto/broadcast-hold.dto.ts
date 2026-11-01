import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** AI19: staff decide a held broadcast. */
export class DecideBroadcastHoldDto {
  @IsIn(['RELEASE', 'BLOCK'])
  action: 'RELEASE' | 'BLOCK';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
