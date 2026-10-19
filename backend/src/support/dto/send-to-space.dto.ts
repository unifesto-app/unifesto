import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Platform hands a case to this event's organiser. */
export class SendToSpaceDto {
  @ApiProperty()
  @IsUUID()
  eventId: string;
}
