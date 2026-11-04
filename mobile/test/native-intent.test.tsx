import { expect, it } from '@jest/globals';
import { redirectSystemPath } from '../app/+native-intent';

// 5.0.0 Android: the Google redirect, routed, left login open after sign-in.
it('ignores the sign-in redirect while running, opens it on a cold start', async () => {
  const path = 'unifesto://auth/callback?code=abc&state=xyz';
  expect(await redirectSystemPath({ path, initial: false })).toBeNull();
  expect(await redirectSystemPath({ path, initial: true })).toBe(path);
  expect(await redirectSystemPath({ path: '/event/hack/register', initial: false })).toBe('/event/hack?register=1');
});
