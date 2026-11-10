import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

/** City for "new events in my city" alerts; null (or blank) turns them off. */
export class SetCityAlertDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((o) => o.city !== null)
  @IsString()
  @MaxLength(100)
  city: string | null;
}
