import { ForbiddenException } from '@nestjs/common';

/** The User columns a suspension check reads (F4). */
export type SuspensionFields = { suspendedAt: Date | null; suspendedUntil: Date | null };

/** Suspended until a future `suspendedUntil`, or banned (no expiry). An expired suspension is inert. */
export function isSuspended(u: SuspensionFields, now = new Date()): boolean {
  return !!u.suspendedAt && (!u.suspendedUntil || u.suspendedUntil > now);
}

/** Refuse a suspended or banned account, with a message the client can show. */
export function assertNotSuspended(u: SuspensionFields): void {
  if (!isSuspended(u)) return;
  throw new ForbiddenException(
    u.suspendedUntil
      ? `This account is suspended until ${u.suspendedUntil.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}. Contact support@unifesto.app.`
      : 'This account has been banned. Contact support@unifesto.app.',
  );
}
