import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

/**
 * A single point-in-time reading of the platform-wide counters we watch for
 * milestone crossings. `prev` is the value at the last check, `curr` is now.
 */
export interface StatsMetricReading {
  metric: 'totalUsers' | 'totalRevenue' | 'totalRegistrations' | 'totalEvents';
  prev: number;
  curr: number;
}

/**
 * A milestone we've decided is worth an immediate "Unifesto Stats" broadcast.
 * Return `null` from detectMilestone() when nothing noteworthy was crossed.
 */
export interface DetectedMilestone {
  /** Short headline shown as the message label, e.g. "🎉 10,000 users!". */
  label: string;
  /** The threshold value that was just crossed (used for logging/dedup). */
  crossedValue: number;
}

/**
 * A band says: "for threshold values up to `upTo`, place a milestone every `step`".
 * Bands are contiguous and ascending; the final band uses `upTo: Infinity` so the
 * ladder keeps generating milestones no matter how large the metric grows.
 */
interface MilestoneBand {
  upTo: number;
  step: number;
}

interface MilestoneConfig {
  emoji: string;
  /** Rendered after the number, e.g. "users on Unifesto", "collected". */
  suffix: string;
  /** Format the crossed value for display (currency vs. plain count). */
  format: (value: number) => string;
  bands: MilestoneBand[];
}

const inr = (v: number) => `₹${v.toLocaleString('en-IN')}`;
const count = (v: number) => v.toLocaleString('en-IN');

/**
 * The milestone ladders, tuned per metric. Steps coarsen as values grow so the
 * team gets a celebration at a steady cadence rather than a flood at scale.
 * Tune these numbers freely — they are the whole "what's worth a ping" policy.
 */
const MILESTONE_CONFIG: Record<StatsMetricReading['metric'], MilestoneConfig> = {
  totalUsers: {
    emoji: '🎉',
    suffix: 'users on Unifesto!',
    format: count,
    bands: [
      { upTo: 1_000, step: 250 },
      { upTo: 20_000, step: 1_000 }, // keep the 1k cadence through 20k (covers 11k–19k)
      { upTo: 100_000, step: 10_000 },
      { upTo: Infinity, step: 50_000 },
    ],
  },
  totalRegistrations: {
    emoji: '🎟',
    suffix: 'registrations!',
    format: count,
    bands: [
      { upTo: 5_000, step: 500 },
      { upTo: 50_000, step: 5_000 },
      { upTo: Infinity, step: 25_000 },
    ],
  },
  totalEvents: {
    emoji: '📅',
    suffix: 'events hosted!',
    format: count,
    bands: [
      { upTo: 1_000, step: 100 },
      { upTo: 10_000, step: 1_000 },
      { upTo: Infinity, step: 5_000 },
    ],
  },
  totalRevenue: {
    emoji: '💰',
    suffix: 'collected!',
    format: inr,
    bands: [
      { upTo: 100_000, step: 25_000 }, // up to ₹1L, every ₹25k
      { upTo: 1_000_000, step: 100_000 }, // up to ₹10L, every ₹1L
      { upTo: 10_000_000, step: 1_000_000 }, // up to ₹1Cr, every ₹10L
      { upTo: Infinity, step: 5_000_000 }, // beyond, every ₹50L
    ],
  },
};

@Injectable()
export class StatsMilestoneService {
  private readonly logger = new Logger(StatsMilestoneService.name);
  /** Redis key holding the last-polled totals as JSON, to detect crossings between ticks. */
  private readonly SNAPSHOT_KEY = 'unifesto:stats:milestone:last';
  /** Short lock so overlapping/multi-instance ticks don't double-broadcast. */
  private readonly LOCK_KEY = 'unifesto:stats:milestone:lock';

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Poll the live platform totals and broadcast any milestone crossed since the
   * previous tick. The first run after deploy (or after a Redis flush) seeds the
   * snapshot silently so we never fire for thresholds already long passed.
   */
  @Cron('*/10 * * * *')
  async checkMilestones(): Promise<void> {
    // Single-flight: whoever wins the lock runs this tick; others skip.
    const gotLock = await this.redis.setNx(this.LOCK_KEY, '1', 300);
    if (!gotLock) return;

    try {
      const current = await this.readTotals();

      const raw = await this.redis.get(this.SNAPSHOT_KEY);
      if (!raw) {
        // Cold start — remember where we are, announce nothing.
        await this.redis.set(this.SNAPSHOT_KEY, JSON.stringify(current));
        this.logger.log('Milestone snapshot seeded (no broadcast on first run)');
        return;
      }

      const prev = JSON.parse(raw) as Record<StatsMetricReading['metric'], number>;

      // A metric may have been added since the last snapshot; default its prev to
      // curr (not 0) so a newly-tracked metric also seeds silently.
      for (const metric of Object.keys(MILESTONE_CONFIG) as StatsMetricReading['metric'][]) {
        await this.evaluateAndBroadcast({
          metric,
          prev: prev[metric] ?? current[metric],
          curr: current[metric],
        });
      }

      await this.redis.set(this.SNAPSHOT_KEY, JSON.stringify(current));
    } catch (err) {
      this.logger.error('Milestone check failed', err);
    }
  }

  /** Current platform-wide totals for every metric we watch. */
  private async readTotals(): Promise<Record<StatsMetricReading['metric'], number>> {
    const [totalUsers, totalEvents, totalRegistrations, revenue] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.event.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.eventRegistration.count(),
      this.prisma.eventRegistration.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { razorpayAmount: true },
      }),
    ]);

    return {
      totalUsers,
      totalEvents,
      totalRegistrations,
      totalRevenue: Number(revenue._sum.razorpayAmount || 0),
    };
  }

  /**
   * Decide whether a metric moving from `prev` to `curr` deserves a real-time
   * WhatsApp broadcast, and what the message should say. Fires on the CROSSING
   * of a threshold (not merely being above it), and if a single jump crosses
   * several thresholds it announces only the highest. Returns null — the common
   * case — when nothing new was crossed, so we stay quiet.
   */
  detectMilestone(reading: StatsMetricReading): DetectedMilestone | null {
    const config = MILESTONE_CONFIG[reading.metric];
    if (!config) return null;

    const crossed = this.crossedThresholds(reading.prev, reading.curr, config.bands);
    if (crossed.length === 0) return null;

    const top = Math.max(...crossed);
    return {
      label: `${config.emoji} ${config.format(top)} ${config.suffix}`,
      crossedValue: top,
    };
  }

  /**
   * Every band-aligned threshold strictly above `prev` and at or below `curr`.
   * Walks the contiguous bands, using each band's step only within its own
   * value range, so the granularity coarsens exactly where the config says.
   * A non-increasing move (curr <= prev, e.g. a refund) yields an empty list.
   */
  private crossedThresholds(prev: number, curr: number, bands: MilestoneBand[]): number[] {
    const hits: number[] = [];
    let bandFloor = 0; // lower edge of the current band (exclusive of prior bands)

    for (const { upTo, step } of bands) {
      // Restrict this band to the part of the (prev, curr] window it owns.
      const from = Math.max(prev, bandFloor);
      const to = Math.min(curr, upTo);

      if (to > from) {
        // First multiple of `step` strictly greater than `from`.
        const first = Math.floor(from / step) * step + step;
        for (let t = first; t <= to; t += step) hits.push(t);
      }

      bandFloor = upTo;
      if (curr <= upTo) break; // window fully consumed — no need to walk further
    }

    return hits;
  }

  /**
   * Called by whatever watches the counters (a cron tick, or a hook on
   * registration/user-create). Runs your detectMilestone() and, if it returns
   * a milestone, fires the broadcast. Fail-soft — never throws to the caller.
   */
  async evaluateAndBroadcast(reading: StatsMetricReading): Promise<void> {
    const milestone = this.detectMilestone(reading);
    if (!milestone) return;

    this.logger.log(`Milestone crossed: ${milestone.label} (value=${milestone.crossedValue})`);

    // A milestone is a one-line celebration, so the per-period counters are 0.
    await this.whatsapp.broadcastStatsUpdate({
      label: milestone.label,
      periodText: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      newUsers: 0,
      newSpaces: 0,
      newEvents: 0,
      registrations: 0,
      revenue: 0,
    }).catch(err => this.logger.error('Milestone broadcast failed', err));
  }
}
