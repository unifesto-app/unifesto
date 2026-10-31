// @ts-nocheck -- plain Node script (type stripping), not part of the Next build.
// Runs after `next build` (npm run build): the pages Next prerendered must be
// exactly src/lib/cached-pages.ts. A prerendered page missing from it gets the
// nonce CSP with no nonce on its scripts and never hydrates; a listed page
// that renders per request gets the CSP without a nonce for nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CACHED_PAGES } from '../src/lib/cached-pages.ts';

const manifest = JSON.parse(readFileSync(new URL('../.next/prerender-manifest.json', import.meta.url), 'utf8'));
// Pages carry an RSC payload (dataRoute); robots, sitemaps and images don't.
// /_not-found and /_global-error are Next's own.
const prerendered = new Set(
  [...Object.entries(manifest.routes), ...Object.entries(manifest.dynamicRoutes)]
    .filter(([route, r]) => r.dataRoute && !route.startsWith('/_'))
    .map(([route, r]) => r.srcRoute ?? route),
);

assert.deepEqual([...prerendered].sort(), [...CACHED_PAGES].sort(), 'prerendered pages ≠ src/lib/cached-pages.ts');
console.log(`cached-pages: ok (${prerendered.size} prerendered pages)`);
