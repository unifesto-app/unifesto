/**
 * Self-check for the refresh decision and the error helper (no test runner in
 * this app). Run:
 *   npx tsc src/lib/api/errors.check.ts --ignoreConfig --noCheck --outDir /tmp/apierr --module commonjs --target es2020 --skipLibCheck && node /tmp/apierr/errors.check.js
 */
import { ApiError, OFFLINE_MESSAGE, errorFrom, expectOk, isSpaceUnavailable, refreshEndsSession } from './errors';

function check(ok: unknown, msg: string) {
  if (!ok) throw new Error(msg);
}

const res = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

async function main() {
  // Only the server refusing the refresh token signs the user out.
  for (const s of [400, 401, 403]) check(refreshEndsSession(s), `${s} should end the session`);
  for (const s of [429, 500, 502, 503, 504, 408, 404]) check(!refreshEndsSession(s), `${s} should keep the session`);

  // Server message wins; Nest's validation arrays use the first entry.
  let e = await errorFrom(res(409, '{"message":"Already registered"}'), 'fallback');
  check(e instanceof ApiError && e.message === 'Already registered' && e.status === 409, 'server message');
  e = await errorFrom(res(400, '{"message":["name is required","x"]}'), 'fallback');
  check(e.message === 'name is required', 'validation array');

  // HTML/empty bodies (proxy 502s) don't throw a SyntaxError; the fallback is used.
  e = await errorFrom(res(502, '<html>Bad gateway</html>'), 'Could not save');
  check(e.message === 'Could not save' && e.status === 502 && !e.offline, 'html body');
  e = await errorFrom(res(500, ''), 'Could not save');
  check(e.message === 'Could not save', 'empty body');

  // The server's error code rides along (J16: suspended space).
  e = await errorFrom(res(403, '{"message":"This space is temporarily unavailable","code":"SPACE_UNAVAILABLE"}'), 'x');
  check(e.code === 'SPACE_UNAVAILABLE' && isSpaceUnavailable(e), 'space unavailable code');
  check(!isSpaceUnavailable(await errorFrom(res(403, '{"message":"Forbidden"}'), 'x')), 'plain 403');

  // No response at all = never reached the server.
  e = await errorFrom(null, 'x');
  check(e.offline && e.message === OFFLINE_MESSAGE, 'offline');

  // expectOk: body on success, ApiError on failure.
  const data = await expectOk<{ id: number }>(res(200, '{"id":7}'), 'x');
  check(data.id === 7, 'ok body');
  const thrown = await expectOk(res(503, ''), 'Service down').catch((err) => err);
  check(thrown instanceof ApiError && thrown.status === 503 && thrown.message === 'Service down', 'expectOk throws');

  console.log('errors.check: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
