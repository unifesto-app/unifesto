import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** POST /v1/events/:event/registrations: one person, from the organiser's own form (K22). */
export class ApiRegisterDto {
  @IsUUID()
  ticketTypeId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEmail()
  @MaxLength(200)
  email: string;

  /** Mobile, with or without +91. */
  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{10,20}$/, { message: 'phone must be a mobile number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  gender?: string;

  /** Answers keyed by question id, from GET /v1/events/:event. */
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  /**
   * The organiser confirms the person is 18 or older, as attendees do when
   * they register themselves (Z11). Under-18s register with a parent instead.
   */
  // Reads the raw value: implicit conversion would turn "false" or "no" into true.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.ageConfirmed === true)
  @Equals(true, { message: 'ageConfirmed must be true: confirm the person is 18 or older' })
  ageConfirmed: true;

  /** Shows as the campaign in the event's registration sources. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaign?: string;
}
