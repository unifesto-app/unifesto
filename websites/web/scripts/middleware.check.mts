// @ts-nocheck -- plain Node script (type stripping), not part of the Next build.
// Self-check for custom-domain routing in middleware.ts. No network: fetch is
// faked. Run: node scripts/middleware.check.mts
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

const { middleware } = await import('../middleware.ts');
const run = (url: string) => middleware(new NextRequest(url));

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
console.log('middleware.check: ok');
