import { expect, it } from '@jest/globals';
import { redirectSystemPath } from '../app/+native-intent';
import { attributionFor, rememberNid } from '../src/services/utm';

// 5.0.0 Android: the Google redirect, routed, left login open after sign-in.
it('ignores the sign-in redirect while running, opens it on a cold start', async () => {
  const path = 'unifesto://auth/callback?code=abc&state=xyz';
  expect(await redirectSystemPath({ path, initial: false })).toBeNull();
  expect(await redirectSystemPath({ path, initial: true })).toBe(path);
  expect(await redirectSystemPath({ path: '/event/hack/register', initial: false })).toBe('/event/hack?register=1');
});

// C19: an email link's nid is credited to whatever I book in the next 24 h.
it('remembers the nid on a link for the next booking, for 24 hours', async () => {
  const event = { id: 'e1', slug: 'fest' };
  await redirectSystemPath({ path: 'https://unifesto.app/event/other?nid=e%3Ac1', initial: false });
  expect(await attributionFor(event)).toEqual({ sourceNid: 'e:c1' });
  await rememberNid('<not a nid>');
  expect((await attributionFor(event)).sourceNid).toBe('e:c1');
  const now = Date.now();
  const later = jest.spyOn(Date, 'now').mockReturnValue(now + 25 * 60 * 60 * 1000);
  expect(await attributionFor(event)).toEqual({});
  later.mockRestore();
});
