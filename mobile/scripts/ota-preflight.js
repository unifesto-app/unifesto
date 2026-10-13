#!/usr/bin/env node
/* eslint-disable */
/**
 * OTA preflight: refuse to publish an update that no live store build can run.
 *
 * With `runtimeVersion: fingerprint`, an update only reaches binaries whose
 * native fingerprint matches. Publishing after a native change (new module,
 * config plugin, native part of app.config.js) silently reaches nobody, and
 * the fix people are waiting for never arrives. This compares this checkout's
 * iOS and Android fingerprints with the ones recorded for the store builds
 * that are live on the channel (runtime-fingerprints.json) and exits 1 if a
 * platform matches none of them.
 *
 * Run through the npm scripts, which load the channel's EAS environment first
 * (app.config.js reads env vars, and they feed the fingerprint):
 *
 *   npm run ota:preflight            # production
 *   npm run ota:record-build         # after a store build ships: record its runtimes from EAS
 *
 * Direct use: node scripts/ota-preflight.js <channel>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLATFORMS = ['ios', 'android'];

/** runtime-fingerprints.json of the app at `root` ({ channel: { platform: [hash] } }). */
function readRecorded(root = ROOT) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'runtime-fingerprints.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * iOS + Android fingerprints of the app at `root`, using that checkout's own
 * @expo/fingerprint (same inputs as expo-updates' fingerprint policy;
 * fingerprint.config.js is picked up automatically).
 */
async function fingerprints(root = ROOT) {
  const { createFingerprintAsync } = require(require.resolve('@expo/fingerprint', { paths: [root] }));
  const out = {};
  for (const platform of PLATFORMS) {
    out[platform] = (await createFingerprintAsync(root, { platforms: [platform] })).hash;
  }
  return out;
}

async function main() {
  const channel = process.argv[2] || 'production';
  const current = await fingerprints();
  const live = readRecorded()[channel] || {};

  let ok = true;
  for (const platform of PLATFORMS) {
    const match = (live[platform] || []).includes(current[platform]);
    console.log(`${match ? '✓' : '✗'} ${platform.padEnd(8)} ${current[platform]}${match ? '' : '  (no live build has this runtime)'}`);
    if (!match) ok = false;
  }
  if (!ok) {
    console.error(
      `\nThis update would reach no live ${channel} build on the platform(s) marked ✗.\n` +
        'Native code changed since the last store build: ship it as a store build instead,\n' +
        'or, if a new store build with these native changes is already live, run `npm run ota:record-build`.\n' +
        `Details: eas fingerprint:compare --environment ${channel}`,
    );
    process.exit(1);
  }
  console.log(`\nSafe to publish to ${channel}.`);
}

module.exports = { PLATFORMS, readRecorded, fingerprints };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
