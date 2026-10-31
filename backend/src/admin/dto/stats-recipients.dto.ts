import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateStatsRecipientsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  numbers: string[];
}
