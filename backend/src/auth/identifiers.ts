import { Prisma } from '@prisma/client';

/**
 * J17: one spelling per identifier. Emails are trimmed + lowercased and mobile
 * numbers are E.164 at every auth entry, so `A@x.com` and `a@x.com` are one
 * account and one OTP bucket.
 */
export function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * E.164 (`+<cc><number>`), or null when it can't be a phone number. India is
 * the default country: a bare 10-digit number (or one with the trunk 0) gets
 * +91. Digits without a + that are longer than that already carry a country
 * code (`919876543210`), the same rule WhatsAppService.formatPhoneNumber uses.
 */
export function normalizeMobile(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s || /[^\d\s+().-]/.test(s)) return null;
  let digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) {
    // as typed
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2); // international dialling prefix
  } else if (/^0\d{10}$/.test(digits)) {
    digits = '91' + digits.slice(1);
  } else if (digits.length === 10) {
    digits = '91' + digits;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/**
 * Case-insensitive email filter for existing mixed-case rows (written before
 * J17). Prisma's insensitive `equals` is ILIKE on Postgres, so `_` and `%` in
 * an address are wildcards: always re-check the hits with {@link sameEmail}.
 */
export function emailFilter(email: string): Prisma.StringFilter {
  return { equals: normalizeEmail(email), mode: 'insensitive' };
}

export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && normalizeEmail(a) === normalizeEmail(b);
}

type IdentityFinder = { userIdentity: { findMany(args: any): Promise<any[]> } };

/**
 * First identity whose `email` (or EMAIL-provider `providerUserId`) is this
 * address in any case: primary first, then oldest. `args.select` callers get
 * the matched field added so the exact re-check can run.
 */
export async function findIdentityByEmail<T = any>(
  db: IdentityFinder,
  email: string,
  args: { where?: Prisma.UserIdentityWhereInput; include?: object; select?: object } = {},
  by: 'email' | 'providerUserId' = 'email',
): Promise<T | null> {
  const e = normalizeEmail(email);
  if (!e) return null;
  const rows = await db.userIdentity.findMany({
    ...args,
    ...(args.select ? { select: { ...args.select, [by]: true } } : {}),
    where: {
      ...args.where,
      ...(by === 'providerUserId' ? { provider: 'EMAIL' } : {}),
      [by]: emailFilter(e),
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    take: 10,
  });
  return rows.find((r) => sameEmail(r[by], e)) ?? null;
}
