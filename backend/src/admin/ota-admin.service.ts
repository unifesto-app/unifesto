import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Apex › OTA updates: read and steer EAS Update rollouts from the admin app.
 * A thin client over Expo's GraphQL API doing what `eas update:edit`,
 * `update:revert-update-rollout` and `update:republish` do (see eas-cli
 * build/update/*.js). Publishing new code stays in the CLI (mobile/docs/OTA.md).
 *
 * Needs EXPO_TOKEN (a robot access token for the Unifesto account).
 */

const ENDPOINT = 'https://api.expo.dev/graphql';
/** mobile/app.config.js extra.eas.projectId; not a secret. */
const PROJECT_ID = process.env.EXPO_PROJECT_ID || '63cae7f2-fb5a-4891-a98f-0ffc04e6c3ad';
export const OTA_CHANNELS = ['production', 'preview'] as const;
export type OtaChannel = (typeof OTA_CHANNELS)[number];

const UPDATE_FIELDS = `
  id group message createdAt platform manifestFragment isRollBackToEmbedded
  gitCommitHash isGitWorkingTreeDirty environment manifestHostOverride assetHostOverride
  runtime { version }
  branch { id name }
  actor { __typename ... on UserActor { username } ... on Robot { firstName } }
  codeSigningInfo { keyid }
  rolloutPercentage
  rolloutControlUpdate { id group }
  fingerprint { hash source { type bucketKey isDebugFingerprint } }
`;

interface ExpoUpdate {
  id: string;
  group: string;
  message: string | null;
  createdAt: string;
  platform: string;
  manifestFragment: string;
  isRollBackToEmbedded: boolean;
  gitCommitHash: string | null;
  isGitWorkingTreeDirty: boolean;
  environment: string | null;
  manifestHostOverride: string | null;
  assetHostOverride: string | null;
  runtime: { version: string };
  branch: { id: string; name: string };
  actor: { __typename: string; username?: string; firstName?: string } | null;
  codeSigningInfo: { keyid: string } | null;
  rolloutPercentage: number | null;
  rolloutControlUpdate: { id: string; group: string } | null;
  fingerprint: { hash: string; source: { type: string; bucketKey: string; isDebugFingerprint: boolean } | null } | null;
}

/** One update group as Apex shows it (a group = the ios + android updates of one publish). */
export interface OtaGroup {
  group: string;
  message: string | null;
  createdAt: string;
  runtimeVersion: string;
  platforms: string[];
  /** Per-platform update ids (what a phone reports as its running update). */
  updateIds: string[];
  /** null when not a staged rollout (everyone on the runtime gets it). */
  rolloutPercentage: number | null;
  /** The update a rollout falls back to; null when it would fall back to the embedded code. */
  controlGroup: string | null;
  isRollBackToEmbedded: boolean;
  gitCommitHash: string | null;
  publishedBy: string | null;
}

@Injectable()
export class OtaAdminService {
  private readonly logger = new Logger(OtaAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * O13 adoption: what active phones run, from the app-version reports. Active
   * = reported in the last `days` days (the app reports at most daily, and on
   * every version/update change). Users on 4.0.x never report a runtime and
   * land in the null bucket.
   */
  async adoption(days = 30): Promise<OtaAdoption> {
    const rows = await this.prisma.user.groupBy({
      by: ['appRuntimeVersion', 'appUpdateId'],
      where: {
        deletedAt: null,
        appPlatform: { in: ['ios', 'android'] },
        appVersionLastReportedAt: { gte: new Date(Date.now() - days * 86_400_000) },
      },
      _count: { _all: true },
    });
    const total = rows.reduce((n, r) => n + r._count._all, 0);
    const runtimes = new Map<string | null, number>();
    for (const r of rows) runtimes.set(r.appRuntimeVersion, (runtimes.get(r.appRuntimeVersion) ?? 0) + r._count._all);
    const byDesc = <T extends { users: number }>(a: T, b: T) => b.users - a.users;
    return {
      days,
      total,
      byRuntime: [...runtimes].map(([runtimeVersion, users]) => ({ runtimeVersion, users })).sort(byDesc),
      byUpdate: rows
        .filter((r) => r.appRuntimeVersion != null)
        .map((r) => ({ runtimeVersion: r.appRuntimeVersion as string, updateId: r.appUpdateId, users: r._count._all }))
        .sort(byDesc),
    };
  }

  /** O12: CI's latest snapshot of main (.github/workflows/ci.yml, "Report OTA status"). */
  async saveMainStatus(status: OtaMainStatus): Promise<void> {
    const value = status as unknown as Prisma.InputJsonValue;
    await this.prisma.platformConfig.upsert({
      where: { id: 'global' },
      create: { id: 'global', otaMainStatus: value },
      update: { otaMainStatus: value },
    });
  }

  /**
   * O12 stale-OTA alarm: mobile commits on main newer than the last production
   * publish, and whether main can still ship as an OTA. Expo being down only
   * hides the "last publish" half.
   */
  async staleness(): Promise<OtaStaleness> {
    const row = await this.prisma.platformConfig.findUnique({ where: { id: 'global' }, select: { otaMainStatus: true } });
    const main = (row?.otaMainStatus ?? null) as OtaMainStatus | null;
    let last: OtaGroup | null = null;
    let expoError: string | null = null;
    try {
      last = (await this.listGroups('production', 1)).groups[0] ?? null;
    } catch (err: any) {
      expoError = err?.message ?? 'Expo unavailable';
    }
    const unshipped = main && !expoError ? unshippedCommits(main.commits, last) : null;
    return {
      main: main && { sha: main.sha, otaSafe: main.otaSafe, fingerprints: main.fingerprints ?? null, reportedAt: main.reportedAt },
      lastPublish: last && { group: last.group, createdAt: last.createdAt, message: last.message, gitCommitHash: last.gitCommitHash },
      unshippedCommits: unshipped?.count ?? null,
      unshippedTruncated: unshipped?.truncated ?? false,
      oldestUnshippedAt: unshipped?.oldestAt ?? null,
      expoError,
    };
  }

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const token = process.env.EXPO_TOKEN;
    if (!token) throw new ServiceUnavailableException('EXPO_TOKEN is not set on the server.');
    let res;
    try {
      res = await axios.post(
        ENDPOINT,
        { query, variables },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20_000 },
      );
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.[0]?.message ?? err?.message ?? 'request failed';
      throw new BadGatewayException(`Expo: ${msg}`);
    }
    if (res.data?.errors?.length) throw new BadGatewayException(`Expo: ${res.data.errors[0].message}`);
    return res.data.data as T;
  }

  /** Latest update groups on the channel's branch (EAS names each channel's branch after it). */
  async listGroups(channel: OtaChannel, limit = 25): Promise<{ channel: OtaChannel; groups: OtaGroup[] }> {
    const data = await this.gql<{ app: { byId: { updateBranchByName: { updateGroups: ExpoUpdate[][] } | null } } }>(
      `query ($appId: String!, $branch: String!, $limit: Int!) {
        app { byId(appId: $appId) { updateBranchByName(name: $branch) {
          updateGroups(limit: $limit, offset: 0) { ${UPDATE_FIELDS} }
        } } }
      }`,
      { appId: PROJECT_ID, branch: channel, limit },
    );
    const groups = data.app.byId.updateBranchByName?.updateGroups ?? [];
    return { channel, groups: groups.filter((g) => g.length).map(toOtaGroup) };
  }

  /** Move a staged rollout to `percentage` (100 finishes it). */
  async setRollout(group: string, percentage: number, adminId: string): Promise<void> {
    const updates = await this.getGroup(group);
    if (updates.some((u) => u.rolloutPercentage == null)) {
      throw new BadRequestException('This update is not a staged rollout.');
    }
    for (const u of updates) {
      await this.gql(
        `mutation ($id: ID!, $pct: Int!) { update { setRolloutPercentage(updateId: $id, percentage: $pct) { id } } }`,
        { id: u.id, pct: percentage },
      );
    }
    this.logger.log(`OTA rollout ${group} → ${percentage}% by admin ${adminId}`);
  }

  /**
   * Revert a staged rollout: delete it, then republish the update it was
   * rolling out over so every phone (including the ones that got the rollout)
   * moves back. Same as `npm run update:revert-rollout`.
   */
  async revertRollout(group: string, adminId: string): Promise<void> {
    const updates = await this.getGroup(group);
    const controlGroups = [...new Set(updates.map((u) => u.rolloutControlUpdate?.group))];
    if (controlGroups.length !== 1 || !controlGroups[0]) {
      // ponytail: no control update means reverting = roll back to embedded; leave that to the CLI.
      throw new BadRequestException('This rollout has no previous update to go back to. Use `npm run update:revert-rollout`.');
    }
    const control = await this.getGroup(controlGroups[0]);

    await this.deleteGroup(group);
    await this.publishCopy(control, `Revert rollout ${group.slice(0, 8)}`);
    this.logger.log(`OTA rollout ${group} reverted to ${controlGroups[0]} by admin ${adminId}`);
  }

  /** Republish an earlier update group so it becomes the newest one: an OTA rollback. */
  async republish(group: string, adminId: string): Promise<void> {
    const updates = await this.getGroup(group);
    if (updates.some((u) => u.rolloutControlUpdate)) {
      throw new BadRequestException('Finish or revert this rollout before republishing it.');
    }
    await this.publishCopy(updates, `Republish ${group.slice(0, 8)}: ${updates[0].message ?? ''}`.trim());
    this.logger.log(`OTA group ${group} republished by admin ${adminId}`);
  }

  private async getGroup(group: string): Promise<ExpoUpdate[]> {
    const data = await this.gql<{ updatesByGroup: ExpoUpdate[] }>(
      `query ($group: ID!) { updatesByGroup(group: $group) { ${UPDATE_FIELDS} } }`,
      { group },
    );
    if (!data.updatesByGroup.length) throw new BadRequestException('Update group not found.');
    return data.updatesByGroup;
  }

  /** Mirrors eas-cli republishAsync (unsigned only: the app doesn't use code signing). */
  private async publishCopy(updates: ExpoUpdate[], message: string): Promise<void> {
    if (updates.some((u) => u.codeSigningInfo)) {
      throw new BadRequestException('This update is code-signed; republish it from the CLI.');
    }
    const first = updates[0];
    const byPlatform = <T>(fn: (u: ExpoUpdate) => T) => Object.fromEntries(updates.map((u) => [u.platform, fn(u)]));
    const content = first.isRollBackToEmbedded
      ? { rollBackToEmbeddedInfoGroup: byPlatform(() => true) }
      : {
          updateInfoGroup: byPlatform((u) => JSON.parse(u.manifestFragment)),
          fingerprintInfoGroup: byPlatform((u) =>
            u.fingerprint
              ? { fingerprintHash: u.fingerprint.hash, fingerprintSource: u.fingerprint.source ?? undefined }
              : undefined,
          ),
        };
    await this.gql(
      `mutation ($input: [PublishUpdateGroupInput!]!) { updateBranch { publishUpdateGroups(publishUpdateGroupsInput: $input) { id } } }`,
      {
        input: [
          {
            branchId: first.branch.id,
            runtimeVersion: first.runtime.version,
            message,
            ...content,
            gitCommitHash: first.gitCommitHash,
            isGitWorkingTreeDirty: first.isGitWorkingTreeDirty,
            environment: first.environment,
            awaitingCodeSigningInfo: false,
            manifestHostOverride: first.manifestHostOverride,
            assetHostOverride: first.assetHostOverride,
          },
        ],
      },
    );
  }

  /** Group deletion is a background job on Expo's side; wait for it like eas-cli does. */
  private async deleteGroup(group: string): Promise<void> {
    const data = await this.gql<{ update: { scheduleUpdateGroupDeletion: { id: string } } }>(
      `mutation ($group: ID!) { update { scheduleUpdateGroupDeletion(group: $group) { id } } }`,
      { group },
    );
    const receiptId = data.update.scheduleUpdateGroupDeletion.id;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const { backgroundJobReceipt } = await this.gql<{
        backgroundJobReceipt: { byId: { state: string; willRetry: boolean; errorMessage: string | null } | null };
      }>(`query ($id: ID!) { backgroundJobReceipt { byId(id: $id) { state willRetry errorMessage } } }`, { id: receiptId });
      const r = backgroundJobReceipt.byId;
      if (r?.state === 'SUCCESS') return;
      if (r?.state === 'FAILURE' && !r.willRetry) throw new BadGatewayException(`Expo: ${r.errorMessage ?? 'deletion failed'}`);
    }
    throw new BadGatewayException('Expo: deleting the rollout is taking too long. Check the EAS dashboard.');
  }
}

export interface OtaAdoption {
  days: number;
  total: number;
  /** runtimeVersion null = clients too old to report one (4.0.x). */
  byRuntime: { runtimeVersion: string | null; users: number }[];
  /** updateId null = running the store build's own code. */
  byUpdate: { runtimeVersion: string; updateId: string | null; users: number }[];
}

export interface OtaMainStatus {
  sha: string;
  /** Both platforms' fingerprints match a live production build (ota-preflight). */
  otaSafe: boolean;
  fingerprints?: { ios?: string; android?: string };
  /** First-parent commits on main touching mobile/, newest first (capped by CI). */
  commits: { sha: string; date: string }[];
  reportedAt: string;
}

export interface OtaStaleness {
  main: { sha: string; otaSafe: boolean; fingerprints: { ios?: string; android?: string } | null; reportedAt: string } | null;
  lastPublish: { group: string; createdAt: string; message: string | null; gitCommitHash: string | null } | null;
  unshippedCommits: number | null;
  /** The count hit CI's cap: it's at least this many. */
  unshippedTruncated: boolean;
  oldestUnshippedAt: string | null;
  expoError: string | null;
}

/** How many mobile commits CI sends (keep in sync with ci.yml). */
export const MAIN_COMMITS_CAP = 300;

/**
 * Mobile commits on main newer than the last publish. Exact when the publish's
 * commit is one of them; otherwise (published from a non-mobile commit or a
 * hotfix branch) everything merged after the publish time counts.
 */
export function unshippedCommits(
  commits: { sha: string; date: string }[],
  last: { gitCommitHash: string | null; createdAt: string } | null,
): { count: number; truncated: boolean; oldestAt: string | null } {
  let newer = commits;
  if (last) {
    const idx = last.gitCommitHash ? commits.findIndex((c) => c.sha === last.gitCommitHash) : -1;
    const at = Date.parse(last.createdAt);
    newer = idx >= 0 ? commits.slice(0, idx) : commits.filter((c) => Date.parse(c.date) > at);
  }
  return {
    count: newer.length,
    // Every commit CI sent is unshipped, so there may be more beyond its cap.
    truncated: newer.length === commits.length && commits.length >= MAIN_COMMITS_CAP,
    oldestAt: newer[newer.length - 1]?.date ?? null,
  };
}

function toOtaGroup(updates: ExpoUpdate[]): OtaGroup {
  const u = updates[0];
  return {
    group: u.group,
    message: u.message,
    createdAt: u.createdAt,
    runtimeVersion: u.runtime.version,
    platforms: updates.map((x) => x.platform).sort(),
    updateIds: updates.map((x) => x.id),
    rolloutPercentage: u.rolloutPercentage,
    controlGroup: u.rolloutControlUpdate?.group ?? null,
    isRollBackToEmbedded: u.isRollBackToEmbedded,
    gitCommitHash: u.gitCommitHash,
    publishedBy: u.actor?.username ?? u.actor?.firstName ?? null,
  };
}
