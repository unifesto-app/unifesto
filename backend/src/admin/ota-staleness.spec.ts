import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { assertOtaStatusSecret } from './ota-admin.controller';
import { MAIN_COMMITS_CAP, unshippedCommits } from './ota-admin.service';

const c = (n: number, date: string) => ({ sha: String(n).padStart(40, 'a'), date });
// Newest first, as CI sends them.
const commits = [c(3, '2026-10-12T10:00:00Z'), c(2, '2026-10-08T10:00:00Z'), c(1, '2026-10-02T10:00:00Z')];

describe('unshippedCommits', () => {
  it('counts commits newer than the published commit when it is on the list', () => {
    expect(unshippedCommits(commits, { gitCommitHash: commits[1].sha, createdAt: '2026-10-20T00:00:00Z' })).toEqual({
      count: 1,
      truncated: false,
      oldestAt: '2026-10-12T10:00:00Z',
    });
  });

  it('falls back to the publish time when the commit is not a mobile commit on main', () => {
    const r = unshippedCommits(commits, { gitCommitHash: 'f'.repeat(40), createdAt: '2026-10-04T00:00:00Z' });
    expect(r.count).toBe(2);
    expect(r.oldestAt).toBe('2026-10-08T10:00:00Z');
  });

  it('is zero when main has nothing newer', () => {
    expect(unshippedCommits(commits, { gitCommitHash: commits[0].sha, createdAt: '2026-10-12T11:00:00Z' }).count).toBe(0);
  });

  it('counts everything with no publish, flagging a capped list', () => {
    const many = Array.from({ length: MAIN_COMMITS_CAP }, (_, i) => c(i, '2026-10-01T00:00:00Z'));
    expect(unshippedCommits(many, null)).toMatchObject({ count: MAIN_COMMITS_CAP, truncated: true });
    expect(unshippedCommits(commits, null)).toMatchObject({ count: 3, truncated: false });
  });
});

describe('assertOtaStatusSecret', () => {
  it('accepts only the exact secret', () => {
    expect(() => assertOtaStatusSecret('s3cret-value', 's3cret-value')).not.toThrow();
    expect(() => assertOtaStatusSecret('s3cret-valuX', 's3cret-value')).toThrow(UnauthorizedException);
    expect(() => assertOtaStatusSecret('s3cret', 's3cret-value')).toThrow(UnauthorizedException);
    expect(() => assertOtaStatusSecret(undefined, 's3cret-value')).toThrow(UnauthorizedException);
  });

  it('is closed when the server has no secret, even for an empty header', () => {
    expect(() => assertOtaStatusSecret('', undefined)).toThrow(ServiceUnavailableException);
    expect(() => assertOtaStatusSecret(undefined, '')).toThrow(ServiceUnavailableException);
  });
});
