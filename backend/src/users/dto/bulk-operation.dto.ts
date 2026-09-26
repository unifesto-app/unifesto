import { IsString, IsArray, IsIn, IsOptional, ArrayMinSize } from 'class-validator';

export class BulkOperationDto {
  @IsString()
  @IsIn(['activate', 'deactivate', 'ban', 'unban', 'verify', 'unverify', 'delete', 'promote_to_organizer', 'demote_to_attendee'])
  action: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds: string[];

  @IsOptional()
  @IsString()
  reason?: string;
}
