import { IsBoolean } from 'class-validator';

export class SetSpaceFeaturedDto {
  @IsBoolean()
  featured: boolean;
}
