import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

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
