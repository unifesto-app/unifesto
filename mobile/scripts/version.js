#!/usr/bin/env node
/* eslint-disable */
/**
 * Single source of truth for bumping the app version everywhere at once.
 *
 * Keeps the JS/config version (package.json, app.config.js — what EAS stamps
 * onto store builds via `appVersionSource: remote`) in lockstep with the
 * committed native version fields (Android versionName, iOS
 * CFBundleShortVersionString + MARKETING_VERSION — what local/dev builds
 * compile in). Drift between the two is exactly what made the app show an old
 * version while the store shipped a new one.
 *
 * Usage:
 *   node scripts/version.js 2.6          # set an explicit version
 *   node scripts/version.js set 2.6      # same, explicit subcommand
 *   node scripts/version.js patch        # 2.5   -> 2.5.1
 *   node scripts/version.js minor        # 2.5   -> 2.6
 *   node scripts/version.js major        # 2.5   -> 3.0
 *
 * Native edits are regex text replacements, so custom Gradle/Xcode config is
 * left untouched. Build numbers (versionCode / CFBundleVersion) are NOT touched
 * here — EAS manages those remotely via `autoIncrement`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 1–4 dotted numeric segments, e.g. "2", "2.5", "2.5.1", "2.5.1.0".
const VERSION_RE = /^\d+(?:\.\d+){0,3}$/;
const RELEASE_TYPES = ['major', 'minor', 'patch'];

/** Each target file: where it lives, the regex that finds the version, and
 *  whether it's required (config) or best-effort (native — may be absent). */
const TARGETS = [
  {
    label: 'app.config.js',
    file: path.join(ROOT, 'app.config.js'),
    // version: "2.5"
    re: /(version:\s*)(["'])(\d+(?:\.\d+){0,3})\2/,
    required: true,
    read: (m) => m[3],
    write: (raw, next) => raw.replace(TARGETS[0].re, `$1$2${next}$2`),
  },
  {
    label: 'android/app/build.gradle',
    file: path.join(ROOT, 'android', 'app', 'build.gradle'),
    // versionName "2.5"
    re: /(versionName\s+")(\d+(?:\.\d+){0,3})(")/,
    required: false,
    write: (raw, next) => raw.replace(TARGETS[1].re, `$1${next}$3`),
  },
  {
    label: 'ios/Unifesto/Info.plist',
    file: path.join(ROOT, 'ios', 'Unifesto', 'Info.plist'),
    // <key>CFBundleShortVersionString</key>\n<string>2.5</string>
    re: /(<key>CFBundleShortVersionString<\/key>\s*<string>)(\d+(?:\.\d+){0,3})(<\/string>)/,
    required: false,
    write: (raw, next) => raw.replace(TARGETS[2].re, `$1${next}$3`),
  },
  {
    label: 'ios/Unifesto.xcodeproj/project.pbxproj',
    file: path.join(ROOT, 'ios', 'Unifesto.xcodeproj', 'project.pbxproj'),
    // MARKETING_VERSION = 2.5;  (appears once per build config)
    re: /(MARKETING_VERSION = )(\d+(?:\.\d+){0,3})(;)/g,
    required: false,
    write: (raw, next) => raw.replace(TARGETS[3].re, `$1${next}$3`),
  },
];

/** Bump a dotted version, preserving its segment count. patch on a 2-segment
 *  version (2.5) appends a patch segment (2.5.1). */
function bump(version, type) {
  const parts = version.split('.').map(Number);
  switch (type) {
    case 'major':
      parts[0] += 1;
      for (let i = 1; i < parts.length; i++) parts[i] = 0;
      break;
    case 'minor':
      if (parts.length < 2) parts.push(0);
      parts[1] += 1;
      for (let i = 2; i < parts.length; i++) parts[i] = 0;
      break;
    case 'patch':
      if (parts.length < 3) parts.push(1);
      else parts[parts.length - 1] += 1;
      break;
  }
  return parts.join('.');
}

/** Read the current version from app.config.js (the release source of truth). */
function readCurrentVersion() {
  const raw = fs.readFileSync(TARGETS[0].file, 'utf8');
  const m = TARGETS[0].re.exec(raw);
  if (!m) throw new Error('Could not read version from app.config.js');
  return m[3];
}

function updatePackageJson(nextVersion) {
  const file = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.version = nextVersion;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  return true;
}

function updateTarget(target, nextVersion) {
  if (!fs.existsSync(target.file)) {
    if (target.required) throw new Error(`Missing required file: ${target.label}`);
    console.warn(`  ⚠ skipped ${target.label} (not found)`);
    return false;
  }
  const raw = fs.readFileSync(target.file, 'utf8');
  // Reset lastIndex for the one global (pbxproj) regex before testing.
  target.re.lastIndex = 0;
  if (!target.re.test(raw)) {
    if (target.required) throw new Error(`No version match in ${target.label}`);
    console.warn(`  ⚠ skipped ${target.label} (no version field matched)`);
    return false;
  }
  fs.writeFileSync(target.file, target.write(raw, nextVersion));
  console.log(`  ✓ ${target.label}`);
  return true;
}

function main() {
  const [arg, maybeVersion] = process.argv.slice(2);

  let nextVersion;
  if (RELEASE_TYPES.includes(arg)) {
    nextVersion = bump(readCurrentVersion(), arg);
  } else {
    // Explicit set: `version.js 2.6` or `version.js set 2.6`.
    const explicit = arg === 'set' ? maybeVersion : arg;
    if (!explicit || !VERSION_RE.test(explicit)) {
      console.error('Usage:');
      console.error('  node scripts/version.js <x.y[.z]>            set explicit version');
      console.error('  node scripts/version.js <major|minor|patch>  bump current version');
      process.exit(1);
    }
    nextVersion = explicit;
  }

  const current = readCurrentVersion();
  console.log(`Setting version: ${current} -> ${nextVersion}`);

  updatePackageJson(nextVersion);
  console.log('  ✓ package.json');
  for (const target of TARGETS) updateTarget(target, nextVersion);

  console.log('\nDone. Rebuild the app (EAS or `expo run`) so binaries pick up the new version.');
}

main();
