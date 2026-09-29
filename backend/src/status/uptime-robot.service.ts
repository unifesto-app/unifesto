import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export type ExternalMonitorStatus = 'up' | 'down' | 'degraded' | 'paused' | 'unknown';

export interface ExternalMonitor {
  id: number;
  name: string;
  url: string | null;
  status: ExternalMonitorStatus;
  /** Uptime % over the last 1, 7 and 30 days (null when UptimeRobot has none). */
  uptime: { day: number | null; week: number | null; month: number | null };
  /** Average response time, ms. */
  responseMs: number | null;
  /** Most recent downtime, if any in the returned logs. */
  lastDown: { at: string; durationSec: number; reason: string | null } | null;
}

export interface ExternalStatus {
  configured: boolean;
  fetchedAt: string | null;
  error: string | null;
  monitors: ExternalMonitor[];
}

/** UptimeRobot v2 monitor status: 0 paused, 1 not checked yet, 2 up, 8 seems down, 9 down. */
export function monitorStatus(code: unknown): ExternalMonitorStatus {
  switch (Number(code)) {
    case 2:
      return 'up';
    case 8:
      return 'degraded';
    case 9:
      return 'down';
    case 0:
      return 'paused';
    default:
      return 'unknown';
  }
}

/** "99.998-100-99.9" → [99.998, 100, 99.9] (non-numbers become null). */
export function parseRatios(raw: unknown): (number | null)[] {
  if (typeof raw !== 'string') return [];
  return raw.split('-').map((p) => {
    const n = Number.parseFloat(p);
    return Number.isFinite(n) ? n : null;
  });
}

/** Map one raw getMonitors entry to what the Apex status screen shows. */
export function toMonitor(m: any): ExternalMonitor {
  const [day, week, month] = parseRatios(m?.custom_uptime_ratio);
  const avg = Number.parseFloat(m?.average_response_time);
  // Log type 1 = a down period (duration in seconds, reason.detail like "Connection Timeout").
  const down = Array.isArray(m?.logs) ? m.logs.find((l: any) => Number(l?.type) === 1) : null;
  return {
    id: Number(m?.id),
    name: String(m?.friendly_name ?? 'Monitor'),
    url: typeof m?.url === 'string' && m.url ? m.url : null,
    status: monitorStatus(m?.status),
    uptime: { day: day ?? null, week: week ?? null, month: month ?? null },
    responseMs: Number.isFinite(avg) ? Math.round(avg) : null,
    lastDown: down
      ? {
          at: new Date(Number(down.datetime) * 1000).toISOString(),
          durationSec: Number(down.duration) || 0,
          reason: down?.reason?.detail ? String(down.reason.detail) : null,
        }
      : null,
  };
}

const CACHE_MS = 60_000;

/**
 * External monitoring for Apex › Status: UptimeRobot checks the site and API
 * from outside our infrastructure, so it still sees an outage that takes our
 * own sampler down with it. Reads with a read-only API key
 * (UPTIMEROBOT_API_KEY); cached for a minute so pull-to-refresh can't hammer
 * their rate limit. Never throws: problems come back in `error`.
 */
@Injectable()
export class UptimeRobotService {
  private readonly logger = new Logger(UptimeRobotService.name);
  private cache: { at: number; value: ExternalStatus } | null = null;

  async getStatus(): Promise<ExternalStatus> {
    const key = process.env.UPTIMEROBOT_API_KEY;
    if (!key) return { configured: false, fetchedAt: null, error: null, monitors: [] };
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;

    let value: ExternalStatus;
    try {
      const res = await axios.post(
        'https://api.uptimerobot.com/v2/getMonitors',
        new URLSearchParams({
          api_key: key,
          format: 'json',
          custom_uptime_ratios: '1-7-30',
          response_times: '1',
          response_times_limit: '1',
          logs: '1',
          logs_limit: '10',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
      );
      const data = res.data ?? {};
      if (data.stat !== 'ok') {
        const msg = data?.error?.message || data?.error?.type || 'UptimeRobot refused the request';
        value = { configured: true, fetchedAt: new Date().toISOString(), error: String(msg), monitors: [] };
      } else {
        value = {
          configured: true,
          fetchedAt: new Date().toISOString(),
          error: null,
          monitors: (Array.isArray(data.monitors) ? data.monitors : []).map(toMonitor),
        };
      }
    } catch (err: any) {
      this.logger.warn(`UptimeRobot fetch failed: ${err?.message ?? err}`);
      // Keep showing the last good answer rather than blanking the screen.
      if (this.cache) return { ...this.cache.value, error: 'Couldn’t reach UptimeRobot; showing the last reading' };
      return { configured: true, fetchedAt: null, error: 'Couldn’t reach UptimeRobot', monitors: [] };
    }
    this.cache = { at: Date.now(), value };
    return value;
  }
}
