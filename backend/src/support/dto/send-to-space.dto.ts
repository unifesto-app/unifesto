import { IsUUID } from 'class-validator';

/** Platform hands a case to this event's organiser. */
export class SendToSpaceDto {
  @IsUUID()
  eventId: string;
}
