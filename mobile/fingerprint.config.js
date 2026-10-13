/**
 * Runtime fingerprint (runtimeVersion policy "fingerprint") settings.
 *
 * Some files inside node_modules are rewritten on this machine by prebuild or
 * local native builds, but hashed pristine on EAS (which fingerprints before
 * its own prebuild). Hashing them made the local runtime differ from the
 * build's, so EAS failed the build and OTA updates published locally would
 * never reach it. They don't change the native API surface, so skip them.
 *
 * sourceSkips: npm scripts are tooling, not native code, but Expo hashes the
 * whole package.json "scripts" block by default, so renaming an ota:* script
 * used to change the runtime. Skipping it keeps script edits OTA-safe.
 * (This replaces the default skip, PackageJsonAndroidAndIosScriptsIfNotContainRun,
 * which PackageJsonScriptsAll covers.)
 * @type {import('expo/fingerprint').Config}
 */
const { SourceSkips } = require('expo/fingerprint');

const config = {
  sourceSkips: SourceSkips.PackageJsonScriptsAll,
  ignorePaths: [
    // react-native-maps' config plugin sets HAVE_GOOGLE_MAPS here at prebuild.
    'node_modules/react-native-maps/ios/AirMaps/RNMapsDefines.h',
    // Hand-edited locally to drop the legacy package="" attribute.
    'node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml',
    // Gradle/CMake output from local Android builds.
    'node_modules/**/android/build/**',
    'node_modules/**/android/.cxx/**',
  ],
};
module.exports = config;
