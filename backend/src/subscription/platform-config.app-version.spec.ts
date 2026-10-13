import { BadRequestException } from '@nestjs/common';
import { assertAppVersionPolicy } from './platform-config.service';

describe('assertAppVersionPolicy', () => {
  const store = (latestVersion: string, minimumVersion: string) => ({
    latestVersion,
    minimumVersion,
    storeUrl: 'https://example.com',
  });

  it('allows an empty latest (soft prompt off) with a zero minimum', () => {
    expect(() =>
      assertAppVersionPolicy({ ios: store('', '0.0.0'), android: store('', '0') }),
    ).not.toThrow();
  });

  it('allows any minimum once a latest is set', () => {
    expect(() =>
      assertAppVersionPolicy({
        ios: store('5.0.0', '5.0.0'),
        android: store('5.0.0', '4.0.0'),
      }),
    ).not.toThrow();
  });

  it('rejects a raised minimum with no latest (old clients would skip it)', () => {
    expect(() =>
      assertAppVersionPolicy({
        ios: store('5.0.0', '0.0.0'),
        android: store('', '5.0.0'),
      }),
    ).toThrow(BadRequestException);
  });
});
