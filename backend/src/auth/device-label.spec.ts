import { describeDevice } from './device-label';

describe('describeDevice', () => {
  const cases: [string | null, string, 'app' | 'browser'][] = [
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome on macOS',
      'browser',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
      'browser',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
      'browser',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge on Windows',
      'browser',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Linux', 'browser'],
    ['Unifesto/42 CFNetwork/1568.100.1 Darwin/24.0.0', 'iPhone', 'app'],
    ['okhttp/4.12.0', 'Android phone', 'app'],
    [null, 'Unknown device', 'browser'],
  ];

  it.each(cases)('%s → %s', (ua, name, kind) => {
    expect(describeDevice(ua)).toEqual({ name, kind });
  });

  it("names the phone from its push install when there's one", () => {
    expect(describeDevice('okhttp/4.12.0', { platform: 'android', deviceModel: 'Pixel 8' })).toEqual({
      name: 'Pixel 8',
      kind: 'app',
    });
    expect(describeDevice(null, { platform: 'ios', deviceModel: null })).toEqual({ name: 'iPhone', kind: 'app' });
  });
});
