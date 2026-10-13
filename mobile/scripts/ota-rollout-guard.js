#!/usr/bin/env node
/* eslint-disable */
/**
 * One rollout at a time: refuse to publish while the newest update on any
 * runtime of the channel's branch is a staged rollout below 100%.
 *
 * Publishing on top of a running rollout silently makes that half-finished
 * update the base of the new one (seen with 4.1.0 → 4.1.1), so phones outside
 * the new percentage land on code nobody finished checking. Promote it to 100%
 * or revert it first (Apex › OTA updates, or npm run update:promote /
 * update:revert-rollout).
 *
 *   node scripts/ota-rollout-guard.js <channel>     # EAS names each channel's branch after it
 *   node scripts/ota-rollout-guard.js --self-test
 */
const { execFileSync } = require('child_process');
const path = require('path');

/** Rollouts still running: the newest group of each runtime (groups come newest first), if below 100%. */
function activeRollouts(groups) {
  const seen = new Set();
  const active = [];
  for (const g of groups) {
    if (seen.has(g.runtimeVersion)) continue;
    seen.add(g.runtimeVersion);
    if (g.rolloutPercentage != null && g.rolloutPercentage < 100) active.push(g);
  }
  return active;
}

function selfTest() {
  const assert = require('assert');
  const g = (runtimeVersion, rolloutPercentage) => ({ runtimeVersion, rolloutPercentage, group: `${runtimeVersion}${rolloutPercentage}` });
  assert.deepStrictEqual(activeRollouts([g('a', undefined), g('b', 100)]), []);
  assert.deepStrictEqual(activeRollouts([g('a', 20), g('b', undefined)]).map((x) => x.group), ['a20']);
  // An older rollout already superseded by a newer publish on the same runtime is not running.
  assert.deepStrictEqual(activeRollouts([g('a', undefined), g('a', 20)]), []);
  assert.deepStrictEqual(activeRollouts([g('a', 50), g('b', 20)]).length, 2);
  console.log('ota-rollout-guard self-test passed');
}

function main() {
  const channel = process.argv[2] || 'production';
  const out = execFileSync(
    'eas',
    ['update:list', '--branch', channel, '--json', '--non-interactive', '--limit', '25'],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const parsed = JSON.parse(out);
  const active = activeRollouts(parsed.currentPage || parsed);
  if (!active.length) {
    console.log(`✓ No rollout in progress on ${channel}.`);
    return;
  }
  console.error(`✗ A rollout is still in progress on ${channel}:`);
  for (const g of active) console.error(`  ${g.rolloutPercentage}%  ${g.platforms}  ${g.group}  ${g.message}`);
  console.error(
    '\nOnly one rollout runs at a time. Promote it to 100% (npm run update:promote, or Apex › OTA updates)\n' +
      'or revert it (npm run update:revert-rollout), then publish again.',
  );
  process.exit(1);
}

if (process.argv.includes('--self-test')) selfTest();
else {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
