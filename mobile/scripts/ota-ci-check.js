#!/usr/bin/env node
/* eslint-disable */
/**
 * CI "OTA-safe" check for PRs touching mobile/.
 *
 * Fails when the PR breaks OTA: the base fingerprint matched a live store
 * runtime on a platform and the PR's head no longer does. Such a PR changes
 * native code, so everything merged after it can only ship in a store build.
 *
 * "Live" comes from the BASE checkout's runtime-fingerprints.json, so a PR
 * can't make itself pass by recording its own fingerprint. If the base was
 * already off every live runtime, the PR can't make OTA any worse: it passes
 * with a notice.
 *
 *   node scripts/ota-ci-check.js <base-mobile-dir>
 *
 * Needs the env vars that feed app.config.js (GOOGLE_MAPS_ANDROID_API_KEY)
 * with their production values, and node_modules installed in both checkouts.
 */
const path = require('path');
const { PLATFORMS, readRecorded, fingerprints } = require('./ota-preflight');

async function main() {
  const baseDir = process.argv[2];
  if (!baseDir) throw new Error('usage: ota-ci-check.js <base-mobile-dir>');
  const live = readRecorded(path.resolve(baseDir)).production || {};
  const isLive = (platform, hash) => (live[platform] || []).includes(hash);

  const head = await fingerprints();
  const headMisses = PLATFORMS.filter((p) => !isLive(p, head[p]));
  for (const p of PLATFORMS) console.log(`head ${p.padEnd(8)} ${head[p]} ${headMisses.includes(p) ? '✗' : '✓ live'}`);
  if (!headMisses.length) {
    console.log('\nOTA-safe: this PR still matches the live store runtimes.');
    return;
  }

  // Only fingerprint the base when it matters (it needs its own npm ci).
  const base = await fingerprints(path.resolve(baseDir));
  const broken = headMisses.filter((p) => isLive(p, base[p]));
  for (const p of PLATFORMS) console.log(`base ${p.padEnd(8)} ${base[p]} ${isLive(p, base[p]) ? '✓ live' : '✗'}`);
  if (broken.length) {
    console.log(`\n::error title=OTA-safe::native change: needs a store build (${broken.join(', ')})`);
    console.error(
      'native change: needs a store build.\n' +
        `The base matched a live ${broken.join(' + ')} runtime and this PR does not, so no OTA published\n` +
        'after it would reach anyone on the current store builds. Label the PR `native` and hold it for the\n' +
        'next store-build window. Locally, `eas fingerprint:compare --environment production` shows what changed.',
    );
    process.exit(1);
  }
  console.log(
    '\n::notice title=OTA-safe::Base was already off the live runtimes, so this PR does not change OTA reach. ' +
      'Everything on main needs a store build.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
