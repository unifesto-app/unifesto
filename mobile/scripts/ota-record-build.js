#!/usr/bin/env node
/* eslint-disable */
/**
 * Record the runtimes of the live store builds, straight from EAS.
 *
 * For each platform, takes the latest finished store build of the profile
 * (`eas build:list --json`) and adds its `runtime.version` to
 * runtime-fingerprints.json under the build's update channel. Older entries are
 * kept: a phone on the previous build still runs that runtime, so delete one
 * only once the minimum version is raised past it. Commit the file afterwards.
 *
 * Unlike hashing the local tree, this records exactly what EAS built, so a
 * dirty checkout, a different env or a local node_modules patch can't record
 * a runtime no phone has.
 *
 *   npm run ota:record-build                    # production profile
 *   node scripts/ota-record-build.js <profile>
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PLATFORMS, readRecorded } = require('./ota-preflight');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'runtime-fingerprints.json');

function latestBuild(platform, profile) {
  const out = execFileSync(
    'eas',
    ['build:list', '--json', '--non-interactive', '--platform', platform, '--build-profile', profile,
      '--status', 'finished', '--distribution', 'store', '--limit', '1'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(out)[0];
}

function main() {
  const profile = process.argv[2] || 'production';
  const recorded = readRecorded();
  for (const platform of PLATFORMS) {
    const build = latestBuild(platform, profile);
    const runtime = build?.runtime?.version;
    if (!runtime) throw new Error(`No finished ${profile} store build with a runtime for ${platform}.`);
    const channel = build.updateChannel?.name || profile;
    const list = ((recorded[channel] ||= {})[platform] ||= []);
    const isNew = !list.includes(runtime);
    if (isNew) list.unshift(runtime);
    console.log(`${platform.padEnd(8)} ${build.appVersion} (${build.appBuildVersion})  ${channel}  ${runtime}${isNew ? '  (added)' : ''}`);
  }
  fs.writeFileSync(FILE, JSON.stringify(recorded, null, 2) + '\n');
  console.log('\nCommit runtime-fingerprints.json with the release.');
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
