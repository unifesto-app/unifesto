import { BadRequestException, Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

/** The fixed primary key of the singleton platform_config row. */
const CONFIG_ID = 'global';

/**
 * App-wide processing fee percentage the attendee pays on top of the ticket
 * price, on every paid registration across all events. Fixed platform-wide and
 * no longer admin-editable — kept as a single constant so the backend charge and
 * the public /config/processing-fee endpoint can never drift apart. The
 * `platform_config.processingFeePercent` column is retained but no longer read.
 */
export const PROCESSING_FEE_PERCENT = 5;

/**
 * The buyer fee never exceeds this per ticket (A34, D11): min(5%, ₹99). Kicks
 * in above a ₹1,980 ticket. Served with the percent so clients show the same.
 */
export const PROCESSING_FEE_CAP_PER_TICKET = 99;

/**
 * Normalise a WhatsApp number to E.164 ("+919848945690"). A bare 10-digit
 * number is taken as Indian; anything else must already carry its country
 * code. Returns null when the input can't be a phone number.
 */
export function normalizeStatsRecipient(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * Version policy for one platform, driving the in-app update prompt.
 * `latestVersion` empty = soft prompt off.
 */
export interface PlatformVersionInfo {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
}

export interface AppVersionConfig {
  ios: PlatformVersionInfo;
  android: PlatformVersionInfo;
}

/**
 * Builds up to 4.x skip the whole check (minimum included) when
 * `latestVersion` is empty, so a minimum only reaches them with a latest set.
 */
export function assertAppVersionPolicy(config: AppVersionConfig): void {
  for (const [name, p] of [
    ['iOS', config.ios],
    ['Android', config.android],
  ] as const) {
    const minIsZero = p.minimumVersion
      .split('.')
      .every((n) => Number(n) === 0);
    if (!p.latestVersion && !minIsZero) {
      throw new BadRequestException(
        `${name}: set a latest version before raising the minimum version`,
      );
    }
    // A minimum above the latest store build forces everyone to update to a
    // version that doesn't exist yet: a lockout.
    if (p.latestVersion && compareVersions(p.minimumVersion, p.latestVersion) > 0) {
      throw new BadRequestException(
        `${name}: minimum version ${p.minimumVersion} is above the latest ${p.latestVersion}`,
      );
    }
  }
}

/** -1, 0 or 1; missing segments count as 0 ("2.0" == "2.0.0"). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/**
 * Source of truth for platform-wide settings that admins can edit at runtime:
 * the app-wide processing fee, and the mobile app version policy that drives
 * the in-app "update available" prompt.
 *
 * Mirrors PlanConfigService: the single row is loaded into memory at boot so
 * callers can read it synchronously. Writers write through and refresh the
 * cache. The cache is per-process; on a multi-instance deployment other
 * instances pick up changes on their next boot / reload.
 */
@Injectable()
export class PlatformConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlatformConfigService.name);
  /** Days after an event ends that post-event actions stay open. See schema. */
  private postEventActionWindowDays = 7;
  private appVersion: AppVersionConfig = {
    ios: {
      latestVersion: '',
      minimumVersion: '0.0.0',
      storeUrl:
        'https://apps.apple.com/in/app/unifesto-discover-events/id6767165496',
    },
    android: {
      latestVersion: '',
      minimumVersion: '0.0.0',
      storeUrl:
        'https://play.google.com/store/apps/details?id=com.unifesto.app',
    },
  };

  /** Tells the other replicas to reload after an edit here. */
  private bumpReplicas: () => Promise<void> = async () => {};

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    if (this.redis) this.bumpReplicas = this.redis.syncCache('platform', () => this.reload());
  }

  /** Reload the cached config from the database. */
  async reload(): Promise<void> {
    try {
      const row = await this.prisma.platformConfig.upsert({
        where: { id: CONFIG_ID },
        create: { id: CONFIG_ID },
        update: {},
      });
      this.postEventActionWindowDays = row.postEventActionWindowDays;
      this.appVersion = this.rowToAppVersion(row);
    } catch (err) {
      this.logger.error(
        `Failed to load platform config, using defaults: ${
          (err as Error).message
        }`,
      );
    }
  }

  private rowToAppVersion(row: {
    iosLatestVersion: string;
    iosMinimumVersion: string;
    iosStoreUrl: string;
    androidLatestVersion: string;
    androidMinimumVersion: string;
    androidStoreUrl: string;
  }): AppVersionConfig {
    return {
      ios: {
        latestVersion: row.iosLatestVersion,
        minimumVersion: row.iosMinimumVersion,
        storeUrl: row.iosStoreUrl,
      },
      android: {
        latestVersion: row.androidLatestVersion,
        minimumVersion: row.androidMinimumVersion,
        storeUrl: row.androidStoreUrl,
      },
    };
  }

  /**
   * App-wide processing fee percentage applied to every paid registration.
   * Fixed platform-wide — see {@link PROCESSING_FEE_PERCENT}.
   */
  getProcessingFeePercent(): number {
    return PROCESSING_FEE_PERCENT;
  }

  /** Most the buyer fee can be per ticket, in rupees (A34). */
  getProcessingFeeCapPerTicket(): number {
    return PROCESSING_FEE_CAP_PER_TICKET;
  }

  /** Version policy for the mobile update prompt (public + admin read). */
  getAppVersion(): AppVersionConfig {
    return this.appVersion;
  }

  /** Admin-set number of days post-event actions stay open after an event ends. */
  getPostEventActionWindowDays(): number {
    return this.postEventActionWindowDays;
  }

  /**
   * The instant post-event actions (certificate issuance, attendee import/add)
   * close for an event that ended at `endDateTime`: the event's end plus the
   * admin-configured window. Simple instant math — `endDateTime` is an absolute
   * timestamp, so we add whole days of milliseconds and never touch local time.
   */
  postEventDeadline(endDateTime: Date): Date {
    const windowMs = this.postEventActionWindowDays * 24 * 60 * 60 * 1000;
    return new Date(endDateTime.getTime() + windowMs);
  }

  /** True while post-event actions are still permitted for an event. */
  isWithinPostEventWindow(endDateTime: Date): boolean {
    return Date.now() < this.postEventDeadline(endDateTime).getTime();
  }

  /** Full config payload for the admin surface. */
  async getConfig(): Promise<{
    processingFeePercent: number;
    processingFeeCapPerTicket: number;
    postEventActionWindowDays: number;
    appVersion: AppVersionConfig;
    appReviewLoginEnabled: boolean;
    requireAgeConfirmation: boolean;
    customSendingDomainsEnabled: boolean;
  }> {
    const row = await this.prisma.platformConfig.findUnique({
      where: { id: CONFIG_ID },
      select: { appReviewLoginEnabled: true, requireAgeConfirmation: true, customSendingDomainsEnabled: true },
    });
    return {
      processingFeePercent: PROCESSING_FEE_PERCENT,
      processingFeeCapPerTicket: PROCESSING_FEE_CAP_PER_TICKET,
      postEventActionWindowDays: this.postEventActionWindowDays,
      appVersion: this.appVersion,
      appReviewLoginEnabled: row?.appReviewLoginEnabled ?? false,
      requireAgeConfirmation: row?.requireAgeConfirmation ?? false,
      customSendingDomainsEnabled: row?.customSendingDomainsEnabled ?? false,
    };
  }

  /** Admin switch for the Z11 18+ gate on self-registration. */
  async setRequireAgeConfirmation(enabled: boolean): Promise<void> {
    await this.prisma.platformConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, requireAgeConfirmation: enabled },
      update: { requireAgeConfirmation: enabled },
    });
    this.logger.warn(`Age confirmation gate turned ${enabled ? 'ON' : 'OFF'}`);
  }

  /** Admin switch for H20: spaces may add their own email sending domain. */
  async setCustomSendingDomainsEnabled(enabled: boolean): Promise<void> {
    await this.prisma.platformConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, customSendingDomainsEnabled: enabled },
      update: { customSendingDomainsEnabled: enabled },
    });
    this.logger.warn(`Custom sending domains turned ${enabled ? 'ON' : 'OFF'}`);
  }

  /** Admin switch for the App Review test login (see auth.service). */
  async setAppReviewLoginEnabled(enabled: boolean): Promise<void> {
    await this.prisma.platformConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, appReviewLoginEnabled: enabled },
      update: { appReviewLoginEnabled: enabled },
    });
    this.logger.warn(`App Review login turned ${enabled ? 'ON' : 'OFF'}`);
  }

  /** Admin update of the post-event action window (in whole days). */
  async setPostEventActionWindowDays(
    days: number,
  ): Promise<{ postEventActionWindowDays: number }> {
    const row = await this.prisma.platformConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, postEventActionWindowDays: days },
      update: { postEventActionWindowDays: days },
    });
    this.postEventActionWindowDays = row.postEventActionWindowDays;
    await this.bumpReplicas();
    this.logger.log(
      `Post-event action window updated to ${this.postEventActionWindowDays} days`,
    );
    return { postEventActionWindowDays: this.postEventActionWindowDays };
  }

  /**
   * Numbers that receive the Unifesto Stats WhatsApp broadcast. Read straight
   * from the database (not the boot-time cache) so an edit made through one
   * replica is honoured by whichever replica runs the cron.
   */
  async getStatsRecipients(): Promise<string[]> {
    const row = await this.prisma.platformConfig.findUnique({
      where: { id: CONFIG_ID },
      select: { statsRecipients: true },
    });
    return row?.statsRecipients ?? [];
  }

  /**
   * Whether an AI feature (D12) is switched on. Read straight from the
   * database so a kill switch flipped through one replica stops them all.
   */
  async isAiFeatureEnabled(feature: string): Promise<boolean> {
    const row = await this.prisma.platformConfig.findUnique({
      where: { id: CONFIG_ID },
      select: { aiEnabledFeatures: true },
    });
    return row?.aiEnabledFeatures.includes(feature) ?? false;
  }

  /**
   * Admin replace of the stats recipient list. Numbers are normalised to E.164
   * and de-duplicated; an invalid entry rejects the whole save.
   */
  async setStatsRecipients(numbers: string[]): Promise<string[]> {
    const normalized: string[] = [];
    for (const n of numbers) {
      const e164 = normalizeStatsRecipient(n);
      if (!e164) {
        throw new BadRequestException(`"${n}" is not a valid phone number`);
      }
      if (!normalized.includes(e164)) normalized.push(e164);
    }
    const row = await this.prisma.platformConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, statsRecipients: normalized },
      update: { statsRecipients: normalized },
    });
    this.logger.log(`Stats recipients updated (${row.statsRecipients.length})`);
    return row.statsRecipients;
  }

  /** Admin update of the mobile app version policy. */
  async setAppVersion(config: AppVersionConfig): Promise<AppVersionConfig> {
    assertAppVersionPolicy(config);
    const data = {
      iosLatestVersion: config.ios.latestVersion,
      iosMinimumVersion: config.ios.minimumVersion,
      iosStoreUrl: config.ios.storeUrl,
      androidLatestVersion: config.android.latestVersion,
      androidMinimumVersion: config.android.minimumVersion,
      androidStoreUrl: config.android.storeUrl,
    };
    const row = await this.prisma.platformConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, ...data },
      update: data,
    });
    this.appVersion = this.rowToAppVersion(row);
    await this.bumpReplicas();
    this.logger.log(
      `App version policy updated (iOS latest ${this.appVersion.ios.latestVersion}, Android latest ${this.appVersion.android.latestVersion})`,
    );
    return this.appVersion;
  }
}
