import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OneSignalService } from './onesignal.service';
import { RegisterPushDeviceDto } from './dto/push-device.dto';

/**
 * User ↔ device registry for push. Each OneSignal push subscription belongs to
 * exactly one user (whoever last signed in on it); on register we also link the
 * subscription to external_id = user.id from the server, so per-user sends reach
 * the device even if the SDK's own `login()` never ran.
 */
@Injectable()
export class PushDeviceService {
  private readonly logger = new Logger(PushDeviceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneSignal: OneSignalService,
  ) {}

  async register(userId: string, dto: RegisterPushDeviceDto) {
    const now = new Date();
    const fields = {
      userId,
      oneSignalId: dto.oneSignalId ?? null,
      platform: dto.platform,
      deviceModel: dto.deviceModel ?? null,
      appVersion: dto.appVersion ?? null,
      optedIn: dto.optedIn,
      lastSeenAt: now,
    };

    // Upsert on subscriptionId: a device that changes hands (sign out, sign in as
    // someone else) moves to the new user instead of being shared by both.
    const existing = await this.prisma.userPushDevice.findUnique({
      where: { subscriptionId: dto.subscriptionId },
      select: { userId: true, linkedAt: true },
    });
    const ownerChanged = !!existing && existing.userId !== userId;

    const device = await this.prisma.userPushDevice.upsert({
      where: { subscriptionId: dto.subscriptionId },
      create: { subscriptionId: dto.subscriptionId, ...fields },
      update: { ...fields, ...(ownerChanged ? { linkedAt: null, linkError: null } : {}) },
    });

    // Link once per (device, owner). Re-reports from the same user skip the
    // OneSignal call; a failed link stays null and is retried on the next report.
    if (!existing?.linkedAt || ownerChanged) {
      const res = await this.oneSignal.linkSubscriptionToExternalId(dto.subscriptionId, userId);
      await this.prisma.userPushDevice.update({
        where: { id: device.id },
        data: res.ok ? { linkedAt: now, linkError: null } : { linkError: res.error ?? 'unknown' },
      });
      return { subscriptionId: device.subscriptionId, linked: res.ok };
    }

    return { subscriptionId: device.subscriptionId, linked: true };
  }

  /**
   * Called on sign-out. Scoped to the caller so nobody can drop another user's
   * device. The SDK's `logout()` detaches the OneSignal identity on the device.
   */
  async unregister(userId: string, subscriptionId: string) {
    const { count } = await this.prisma.userPushDevice.deleteMany({
      where: { subscriptionId, userId },
    });
    return { removed: count > 0 };
  }

  /** The caller's own registered devices (for "is my phone reachable?" checks). */
  listMine(userId: string) {
    return this.prisma.userPushDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        subscriptionId: true,
        platform: true,
        deviceModel: true,
        appVersion: true,
        optedIn: true,
        linkedAt: true,
        lastSeenAt: true,
      },
    });
  }
}
