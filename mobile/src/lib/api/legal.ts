import { call } from './manageEvent';

/* I2: legal documents this account still has to accept, and accepting one. */

export interface PendingLegalDoc {
  slug: string;
  version: number;
  title: string;
  summary: string | null;
}

export const getPendingLegal = () => call<PendingLegalDoc[]>('/legal/pending');

export const acceptLegal = (slug: string, version: number) =>
  call<{ ok: true }>(`/legal/${slug}/accept`, {
    method: 'POST',
    body: JSON.stringify({ version, client: 'mobile' }),
  });
