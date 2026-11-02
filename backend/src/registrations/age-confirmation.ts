import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Z11 (DPDP): taking a ticket for yourself (registering, claiming a group seat)
 * needs an 18+ confirmation once the platform switch is on. Off by default (4.x
 * apps cannot send it). Organiser manual add/import and transfers never come
 * through here: someone else hands the ticket over, which is the under-18 guest path.
 */
export async function assertAgeConfirmed(prisma: PrismaService, userId: string): Promise<void> {
  const config = await prisma.platformConfig.findUnique({
    where: { id: 'global' },
    select: { requireAgeConfirmation: true },
  });
  if (!config?.requireAgeConfirmation) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ageConfirmedAt: true },
  });
  if (user?.ageConfirmedAt) return;
  throw new BadRequestException({
    statusCode: 400,
    code: 'AGE_CONFIRMATION_REQUIRED',
    message:
      'Confirm you are 18 or older to register. Under 18? Ask the organiser to register you through a parent or guardian.',
  });
}
