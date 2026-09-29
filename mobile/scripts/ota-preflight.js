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
 *   npm run ota:record               # after a store build ships: add its fingerprints
 *
 * Direct use: node scripts/ota-preflight.js <channel> [--record]
 */
const fs = require('fs');
const path = require('path');
const { createFingerprintAsync } = require('@expo/fingerprint');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'runtime-fingerprints.json');
const PLATFORMS = ['ios', 'android'];

function readRecorded() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const channel = process.argv[2] || 'production';
  const record = process.argv.includes('--record');

  const current = {};
  for (const platform of PLATFORMS) {
    // Same inputs as expo-updates' fingerprint policy; fingerprint.config.js is picked up automatically.
    const { hash } = await createFingerprintAsync(ROOT, { platforms: [platform] });
    current[platform] = hash;
  }

  const recorded = readRecorded();
  recorded[channel] = recorded[channel] || {};

  if (record) {
    for (const platform of PLATFORMS) {
      const list = recorded[channel][platform] || [];
      if (!list.includes(current[platform])) list.unshift(current[platform]);
      recorded[channel][platform] = list;
    }
    fs.writeFileSync(FILE, JSON.stringify(recorded, null, 2) + '\n');
    console.log(`Recorded ${channel} runtimes:`);
    for (const p of PLATFORMS) console.log(`  ${p.padEnd(8)} ${current[p]}`);
    console.log('Commit runtime-fingerprints.json with the release.');
    return;
  }

  let ok = true;
  for (const platform of PLATFORMS) {
    const live = recorded[channel][platform] || [];
    const match = live.includes(current[platform]);
    console.log(`${match ? '✓' : '✗'} ${platform.padEnd(8)} ${current[platform]}${match ? '' : '  (no live build has this runtime)'}`);
    if (!match) ok = false;
  }
  if (!ok) {
    console.error(
      `\nThis update would reach no live ${channel} build on the platform(s) marked ✗.\n` +
        'Native code changed since the last store build: ship it as a store build instead,\n' +
        'or, if a new store build with these native changes is already live, run `npm run ota:record`.\n' +
        `Details: eas fingerprint:compare --environment ${channel}`,
    );
    process.exit(1);
  }
  console.log(`\nSafe to publish to ${channel}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
