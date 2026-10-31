/** How a linked device reads in the list: "iPhone 15 Pro", "Chrome on macOS". */
export interface DeviceLabel {
  name: string;
  kind: 'app' | 'browser';
}

// Order matters: Edge and Opera also say Chrome, and every Chromium says Safari.
const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
// iPhones say "like Mac OS X" and Android says Linux, so those come first.
const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

const match = (ua: string, list: [RegExp, string][]) => list.find(([re]) => re.test(ua))?.[1];

/**
 * The phone's model when the session registered a push install, else a guess
 * from the sign-in's user agent.
 */
export function describeDevice(
  userAgent: string | null,
  push?: { platform: string; deviceModel: string | null } | null,
): DeviceLabel {
  if (push) {
    return { kind: 'app', name: push.deviceModel || (push.platform === 'ios' ? 'iPhone' : 'Android phone') };
  }
  const ua = userAgent ?? '';
  // React Native's fetch: CFNetwork/Darwin on iOS, okhttp on Android.
  if (/CFNetwork|Darwin\//.test(ua)) return { kind: 'app', name: 'iPhone' };
  if (/okhttp|Dalvik/i.test(ua)) return { kind: 'app', name: 'Android phone' };
  const browser = match(ua, BROWSERS);
  const system = match(ua, SYSTEMS);
  if (!browser) return { kind: 'browser', name: system ? `Browser on ${system}` : 'Unknown device' };
  return { kind: 'browser', name: system ? `${browser} on ${system}` : browser };
}
