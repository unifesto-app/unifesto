import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  /** Project slug without the "unifesto-" prefix: backend, web, apex, mobile. */
  project: string;
  level: string;
  /** Events and affected users in the last 24 hours. */
  count: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  url: string;
}

export interface SentryIssues {
  configured: boolean;
  fetchedAt: string | null;
  error: string | null;
  /** All unresolved issues seen in the window; `issues` is the top slice. */
  total: number | null;
  issues: SentryIssue[];
}

/** Map one raw organization-issues entry to what the Apex status screen shows. */
export function toIssue(i: any): SentryIssue {
  return {
    id: String(i?.id),
    shortId: String(i?.shortId ?? ''),
    title: String(i?.title ?? 'Untitled issue'),
    culprit: typeof i?.culprit === 'string' && i.culprit ? i.culprit : null,
    project: String(i?.project?.slug ?? 'unknown').replace(/^unifesto-/, ''),
    level: String(i?.level ?? 'error'),
    count: Number(i?.count) || 0,
    users: Number(i?.userCount) || 0,
    firstSeen: String(i?.firstSeen ?? ''),
    lastSeen: String(i?.lastSeen ?? ''),
    url: String(i?.permalink ?? ''),
  };
}

// Org is in Sentry's US region; every project (project=-1), busiest first.
const ISSUES_URL = 'https://us.sentry.io/api/0/organizations/unifesto/issues/';
const CACHE_MS = 60_000;

/**
 * Sentry for Apex › Status: unresolved issues across backend, web, apex and
 * mobile that fired in the last 24 hours, so an admin sees errors next to
 * uptime without opening Sentry, and can resolve them. Uses SENTRY_API_TOKEN
 * (event:read + event:write; the source-map SENTRY_AUTH_TOKEN can't touch
 * issues). Reads are cached for a minute and never throw: problems come back
 * in `error`.
 */
@Injectable()
export class SentryIssuesService {
  private readonly logger = new Logger(SentryIssuesService.name);
  private cache: { at: number; value: SentryIssues } | null = null;

  async getIssues(): Promise<SentryIssues> {
    const token = process.env.SENTRY_API_TOKEN;
    if (!token) return { configured: false, fetchedAt: null, error: null, total: null, issues: [] };
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;

    let value: SentryIssues;
    try {
      const res = await axios.get(ISSUES_URL, {
        params: { project: -1, query: 'is:unresolved', statsPeriod: '24h', sort: 'freq', limit: 10 },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });
      const hits = Number(res.headers?.['x-hits']);
      const issues = (Array.isArray(res.data) ? res.data : []).map(toIssue);
      value = {
        configured: true,
        fetchedAt: new Date().toISOString(),
        error: null,
        total: Number.isFinite(hits) ? hits : issues.length,
        issues,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      this.logger.warn(`Sentry issues fetch failed: ${status ?? err?.message ?? err}`);
      // 401/403 is a token problem, not an outage: say so instead of a stale list.
      if (status === 401 || status === 403) {
        return { configured: true, fetchedAt: null, error: 'Sentry rejected SENTRY_API_TOKEN (it needs event:read)', total: null, issues: [] };
      }
      // Keep showing the last good answer rather than blanking the screen.
      if (this.cache) return { ...this.cache.value, error: 'Couldn’t reach Sentry; showing the last reading' };
      return { configured: true, fetchedAt: null, error: 'Couldn’t reach Sentry', total: null, issues: [] };
    }
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Mark one issue resolved. Unlike reads this throws, so the admin sees a failed click. */
  async resolve(id: string): Promise<{ id: string; status: 'resolved' }> {
    const token = process.env.SENTRY_API_TOKEN;
    if (!token) throw new ServiceUnavailableException('Sentry isn’t connected');
    // It goes into the URL path: digits only, so it can't aim the token at another endpoint.
    if (!/^\d+$/.test(id)) throw new BadRequestException('Not a Sentry issue id');
    try {
      await axios.put(
        `${ISSUES_URL}${id}/`,
        { status: 'resolved' },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 },
      );
    } catch (err: any) {
      const status = err?.response?.status;
      this.logger.warn(`Sentry resolve ${id} failed: ${status ?? err?.message ?? err}`);
      if (status === 404) throw new NotFoundException('That issue no longer exists in Sentry');
      throw new BadGatewayException(
        status === 401 || status === 403
          ? 'Sentry rejected SENTRY_API_TOKEN (it needs event:write)'
          : 'Couldn’t reach Sentry',
      );
    }
    this.cache = null; // the next read drops the resolved issue
    return { id, status: 'resolved' };
  }
}
