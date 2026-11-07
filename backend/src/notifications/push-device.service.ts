import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OnEvent } from '../common/on-event';
import { PUSH_INSTALLS_SIGNED_OUT } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { OneSignalService } from './onesignal.service';
import { RegisterPushDeviceDto } from './dto/push-device.dto';

/**
 * User ↔ device registry for push. Each install belongs to exactly one user
 * (whoever last signed in on it). Old builds report a OneSignal subscription,
 * which we also link to external_id = user.id from the server, so per-user
 * sends reach the device even if the SDK's own `login()` never ran. Builds on
 * native push report their APNs/FCM token (C12), which needs no link.
 */
@Injectable()
export class PushDeviceService {
  private readonly logger = new Logger(PushDeviceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneSignal: OneSignalService,
  ) {}

  async register(userId: string, dto: RegisterPushDeviceDto, sessionId?: string) {
    const now = new Date();
    const fields = {
      userId,
      // The sign-in on this phone: signing it out elsewhere stops this install's pushes.
      sessionId: sessionId ?? null,
      oneSignalId: dto.oneSignalId ?? null,
      platform: dto.platform,
      deviceModel: dto.deviceModel ?? null,
      appVersion: dto.appVersion ?? null,
      optedIn: dto.optedIn,
      lastSeenAt: now,
    };
    if (dto.token) return this.registerToken(userId, dto.token, dto, fields);
    const subscriptionId = dto.subscriptionId!; // the DTO requires one or the other

    // Upsert on subscriptionId: a device that changes hands (sign out, sign in as
    // someone else) moves to the new user instead of being shared by both.
    const existing = await this.prisma.userPushDevice.findUnique({
      where: { subscriptionId },
      select: { userId: true, linkedAt: true },
    });
    const ownerChanged = !!existing && existing.userId !== userId;

    const device = await this.prisma.userPushDevice.upsert({
      where: { subscriptionId },
      create: { subscriptionId, ...fields },
      update: { ...fields, ...(ownerChanged ? { linkedAt: null, linkError: null } : {}) },
    });

    // Link once per (device, owner). Re-reports from the same user skip the
    // OneSignal call; a failed link stays null and is retried on the next report.
    if (!existing?.linkedAt || ownerChanged) {
      const res = await this.oneSignal.linkSubscriptionToExternalId(subscriptionId, userId);
      await this.prisma.userPushDevice.update({
        where: { id: device.id },
        data: res.ok ? { linkedAt: now, linkError: null } : { linkError: res.error ?? 'unknown' },
      });
      return { subscriptionId: device.subscriptionId, linked: res.ok };
    }

    return { subscriptionId: device.subscriptionId, linked: true };
  }

  /**
   * A build on native push: upsert on the APNs/FCM token, nothing to link.
   * `replacesSubscriptionId` is this install's old OneSignal subscription:
   * deleting it stops OneSignal pushing the same phone a second copy. Only the
   * caller's own row counts (no row = nothing left to do). `replaced` stays
   * false while the delete fails, so the app sends it again next time.
   */
  private async registerToken(
    userId: string,
    token: string,
    dto: RegisterPushDeviceDto,
    fields: Omit<Prisma.UserPushDeviceUncheckedCreateInput, 'token'>,
  ) {
    const sandbox = dto.apnsEnv === 'development';
    await this.prisma.userPushDevice.upsert({
      where: { token },
      create: { ...fields, token, sandbox },
      update: { ...fields, sandbox },
    });
    let replaced = true;
    if (dto.replacesSubscriptionId) {
      const old = await this.prisma.userPushDevice.findFirst({
        where: { subscriptionId: dto.replacesSubscriptionId, userId },
        select: { id: true },
      });
      if (old) {
        replaced = await this.oneSignal.deleteSubscription(dto.replacesSubscriptionId);
        if (replaced) await this.prisma.userPushDevice.delete({ where: { id: old.id } });
      }
    }
    return { linked: true, replaced };
  }

  /**
   * Called on sign-out with the install's subscription id or token. Scoped to
   * the caller so nobody can drop another user's device. On old builds the
   * SDK's `logout()` detaches the OneSignal identity on the device.
   */
  async unregister(userId: string, id: string) {
    const { count } = await this.prisma.userPushDevice.deleteMany({
      where: { userId, OR: [{ subscriptionId: id }, { token: id }] },
    });
    return { removed: count > 0 };
  }

  /**
   * Their rows are already gone with the session. Deleting the subscription is
   * what stops the phone getting the user's pushes before the app reopens and
   * finds itself signed out.
   */
  @OnEvent(PUSH_INSTALLS_SIGNED_OUT, { async: true })
  async onSignedOut(subscriptionIds: string[]) {
    for (const id of subscriptionIds) await this.oneSignal.deleteSubscription(id);
  }

  /** The caller's own registered devices (for "is my phone reachable?" checks). */
  listMine(userId: string) {
    return this.prisma.userPushDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        subscriptionId: true,
        token: true,
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
