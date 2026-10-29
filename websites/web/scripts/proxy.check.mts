// @ts-nocheck -- plain Node script (type stripping), not part of the Next build.
// Self-check for src/proxy.ts: custom-domain routing and the console gate. No
// network: fetch is faked.
// Run: node --experimental-transform-types --import ./test/register.mjs scripts/proxy.check.mts
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// next ships no `exports` map, so ESM needs the explicit file for next/server.
registerHooks({
  resolve: (spec, ctx, next) => next(spec === 'next/server' ? 'next/server.js' : spec, ctx),
});
const { NextRequest } = await import('next/server');

const calls: string[] = [];
globalThis.fetch = (async (url: string) => {
  calls.push(url);
  return url.includes('host=events.acme.edu')
    ? new Response(JSON.stringify({ spaceSlug: 'acme' }), { status: 200 })
    : new Response('{}', { status: 404 });
}) as typeof fetch;

const { proxy } = await import('../src/proxy.ts');
const run = (url: string, cookie?: string) => proxy(new NextRequest(url, cookie ? { headers: { cookie } } : undefined));

// Own hosts untouched / canonicalised.
assert.equal((await run('https://www.unifesto.app/events')).headers.get('x-middleware-next'), '1');
assert.equal((await run('https://unifesto.app/x')).headers.get('location'), 'https://www.unifesto.app/x');

// Unknown custom host: 404.
assert.equal((await run('https://evil.example.com/')).status, 404);

// Tenant root rewrites to its space page and tags the request.
const root = await run('https://events.acme.edu/');
assert.equal(root.headers.get('x-middleware-rewrite'), 'https://events.acme.edu/space/acme');
assert.equal(root.headers.get('x-middleware-request-x-tenant-space'), 'acme');

// Own space path → /, events pass with tenant headers, other paths → main site.
assert.equal((await run('https://events.acme.edu/space/acme')).headers.get('location'), 'https://events.acme.edu/');
const ev = await run('https://events.acme.edu/event/hack-26');
assert.equal(ev.headers.get('x-middleware-next'), '1');
assert.equal(ev.headers.get('x-middleware-request-x-tenant-host'), 'events.acme.edu');
assert.equal((await run('https://events.acme.edu/space/other')).headers.get('location'), 'https://www.unifesto.app/space/other');
assert.equal((await run('https://events.acme.edu/privacy?a=1')).headers.get('location'), 'https://www.unifesto.app/privacy?a=1');

// Resolved once, then cached.
assert.equal(calls.filter((c) => c.includes('events.acme.edu')).length, 1);

// The console (Track V). A tenant's /console goes to the main site.
assert.equal((await run('https://events.acme.edu/console/events')).headers.get('location'), 'https://www.unifesto.app/console/events');
// Signed out: login with the way back; login, no-access and the projector stay open.
assert.equal(
  (await run('https://www.unifesto.app/console/events?space=s1')).headers.get('location'),
  'https://www.unifesto.app/console/login?next=%2Fconsole%2Fevents%3Fspace%3Ds1',
);
for (const open of ['/console/login', '/console/no-access', '/console/present/ev1']) {
  assert.equal((await run(`https://www.unifesto.app${open}`)).headers.get('x-middleware-next'), '1', open);
}
// A live token passes; an expired or malformed one doesn't; signed in, login goes home.
const jwt = (p: object) => `unifesto_token=e30.${Buffer.from(JSON.stringify(p)).toString('base64url')}.x`;
const live = jwt({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
assert.equal((await run('https://www.unifesto.app/console', live)).headers.get('x-middleware-next'), '1');
assert.match((await run('https://www.unifesto.app/console', jwt({ userId: 'u1', exp: 1 }))).headers.get('location'), /\/console\/login/);
assert.match((await run('https://www.unifesto.app/console', 'unifesto_token=garbage')).headers.get('location'), /\/console\/login/);
assert.equal((await run('https://www.unifesto.app/console/login', live)).headers.get('location'), 'https://www.unifesto.app/console');
// Only the console's CSP lets in LiveKit, the API socket and Maps.
assert.match((await run('https://www.unifesto.app/console', live)).headers.get('content-security-policy'), /wss:\/\/\*\.livekit\.cloud/);
assert.doesNotMatch((await run('https://www.unifesto.app/events')).headers.get('content-security-policy'), /livekit/);
console.log('proxy.check: ok');
