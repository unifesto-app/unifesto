import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const LEGAL_CLIENTS = ['web', 'space', 'mobile'] as const;
export type LegalClient = (typeof LEGAL_CLIENTS)[number];

export class AcceptLegalDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsIn(LEGAL_CLIENTS)
  client: LegalClient;
}

export class SaveLegalDraftDto {
  @IsString()
  @MaxLength(160)
  title: string;

  @IsString()
  @MaxLength(200_000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsBoolean()
  requiresAcceptance?: boolean;
}
