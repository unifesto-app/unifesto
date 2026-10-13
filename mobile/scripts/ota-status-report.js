#!/usr/bin/env node
/* eslint-disable */
/**
 * Stale-OTA alarm (O12): after a push to main that touches mobile/, CI posts
 * main's OTA status to the backend, which Apex › OTA updates compares with the
 * last production publish on EAS.
 *
 *   sha          the commit CI checked
 *   otaSafe      both platforms' fingerprints match a live production build
 *                (same comparison as scripts/ota-preflight.js)
 *   commits      first-parent commits on main touching mobile/, newest first
 *
 * Env: OTA_STATUS_URL (backend base URL, e.g. https://api.unifesto.app),
 * OTA_STATUS_SECRET, GOOGLE_MAPS_ANDROID_API_KEY (feeds the Android
 * fingerprint, like the EAS production environment). Missing any of them skips
 * the report with a warning rather than posting a wrong "needs a store build".
 * Needs full git history (actions/checkout fetch-depth: 0).
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { createFingerprintAsync } = require('@expo/fingerprint');

const ROOT = path.resolve(__dirname, '..');
const CAP = 300; // keep in sync with MAIN_COMMITS_CAP in backend/src/admin/ota-admin.service.ts

async function main() {
  const { OTA_STATUS_URL, OTA_STATUS_SECRET, GOOGLE_MAPS_ANDROID_API_KEY } = process.env;
  if (!OTA_STATUS_URL || !OTA_STATUS_SECRET || !GOOGLE_MAPS_ANDROID_API_KEY) {
    console.log('::warning::OTA status not reported: set OTA_STATUS_URL, OTA_STATUS_SECRET and GOOGLE_MAPS_ANDROID_API_KEY.');
    return;
  }

  const live = require(path.join(ROOT, 'runtime-fingerprints.json')).production || {};
  const fingerprints = {};
  let otaSafe = true;
  for (const platform of ['ios', 'android']) {
    const { hash } = await createFingerprintAsync(ROOT, { platforms: [platform] });
    fingerprints[platform] = hash;
    if (!(live[platform] || []).includes(hash)) otaSafe = false;
  }

  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const sha = git('rev-parse', 'HEAD');
  const commits = git('log', '--first-parent', `-n${CAP}`, '--format=%H %cI', 'HEAD', '--', '.')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [s, date] = line.split(' ');
      return { sha: s, date };
    });

  const res = await fetch(`${OTA_STATUS_URL.replace(/\/$/, '')}/admin/ota/main-status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ota-status-secret': OTA_STATUS_SECRET },
    body: JSON.stringify({ sha, otaSafe, fingerprints, commits }),
  });
  if (!res.ok) throw new Error(`OTA status report failed: ${res.status} ${await res.text()}`);
  console.log(`Reported main ${sha.slice(0, 7)}: ${otaSafe ? 'OTA-safe' : 'needs a store build'}, ${commits.length} mobile commits.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
