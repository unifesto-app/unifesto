import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Provider } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { findIdentityByEmail, normalizeEmail } from './identifiers';

/**
 * E1: the one way to bring a person in by email (sponsor portal access, judges
 * and mentors, imported attendees, support guests). Finds the account behind
 * the email, or makes a claimable placeholder: a random placeholder mobile and
 * an unverified EMAIL identity. Signing in later with that email resolves to
 * this account, so whatever they were invited to is already theirs: that is
 * the claim. The caller then sends the invite (EmailService.sendCollaboratorInvite).
 *
 * The answer is the same whether or not an account existed, so an invite never
 * tells the inviter who is on Unifesto. An existing account is never renamed
 * by an inviter; `fillMissingName` (attendee import only) names an account
 * that has no name at all.
 */
export async function findOrCreateUserByEmail(
  prisma: PrismaService,
  email: string,
  name?: string | null,
  opts: { fillMissingName?: boolean } = {},
): Promise<string> {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new BadRequestException('A valid email is required.');
  const cleanName = name?.trim() || null;

  const existing = await findIdentityByEmail<{ userId: string; user: { fullName: string | null } | null }>(
    prisma,
    normalized,
    { select: { userId: true, user: { select: { fullName: true } } } },
  );
  if (existing) {
    if (opts.fillMissingName && cleanName && !existing.user?.fullName) {
      await prisma.user
        .update({ where: { id: existing.userId }, data: { fullName: cleanName } })
        .catch(() => undefined);
    }
    return existing.userId;
  }

  // Random 9 digits, retried on the tiny chance of a unique clash (not
  // Date.now, which repeats inside a tight import loop).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const user = await prisma.user.create({
        data: {
          mobileNumber: `+0${crypto.randomInt(100000000, 999999999)}`,
          mobileVerified: false,
          fullName: cleanName,
          identities: {
            create: {
              provider: Provider.EMAIL,
              providerUserId: normalized,
              email: normalized,
              emailVerified: false,
              isPrimary: true,
            },
          },
        },
        select: { id: true },
      });
      return user.id;
    } catch (err) {
      // A concurrent create may have won the email: re-resolve.
      const raced = await findIdentityByEmail<{ userId: string }>(prisma, normalized, { select: { userId: true } });
      if (raced) return raced.userId;
      if (attempt === 4) throw err;
    }
  }
  throw new BadRequestException(`Could not resolve an account for ${email}`);
}

/** The email (primary first) and name to address an invite to, if the account has one. */
export async function inviteeContact(
  prisma: PrismaService,
  userId: string,
): Promise<{ email: string; name: string | null } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      identities: {
        where: { email: { not: null } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: { email: true },
        take: 1,
      },
    },
  });
  const email = user?.identities[0]?.email;
  return email ? { email, name: user.fullName } : null;
}
