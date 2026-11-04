const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

/**
 * Strip local symbols from the frameworks embedded in Release builds.
 *
 * Nothing stripped them: the Pods project sets STRIP_INSTALLED_PRODUCT = NO and
 * React Native's prebuilt React and hermesvm frameworks ship unstripped. That
 * was 16 MB of the 5.0.0 (40) install (React alone 6 MB). `strip -x` keeps the
 * exported symbols dyld links against, and dSYMs are matched by UUID, which
 * stripping leaves alone, so crash symbolication is unchanged.
 *
 * A Podfile script_phase, because CocoaPods adds it after "[CP] Embed Pods
 * Frameworks" (which copies and signs the frameworks); stripping invalidates
 * that signature, so each framework is re-signed the way the embed script does.
 */
const SCRIPT = `[ "$CONFIGURATION" = "Release" ] || exit 0
for fw in "$TARGET_BUILD_DIR/$FRAMEWORKS_FOLDER_PATH"/*.framework; do
  [ -d "$fw" ] || continue
  xcrun strip -x "$fw/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$fw/Info.plist")" || exit 1
  if [ -n "\${EXPANDED_CODE_SIGN_IDENTITY:-}" ] && [ "\${CODE_SIGNING_REQUIRED:-}" != "NO" ] && [ "\${CODE_SIGNING_ALLOWED:-}" != "NO" ]; then
    /usr/bin/codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" \${OTHER_CODE_SIGN_FLAGS:-} --preserve-metadata=identifier,entitlements "$fw" || exit 1
  fi
done`;

module.exports = function withStripFrameworkSymbols(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const result = mergeContents({
        tag: 'unifesto-strip-framework-symbols',
        src: fs.readFileSync(podfile, 'utf8'),
        newSrc: [
          "  script_phase name: 'Strip framework symbols', execution_position: :any, script: <<~'SH'",
          ...SCRIPT.split('\n').map((line) => `    ${line}`),
          '  SH',
        ].join('\n'),
        anchor: /use_expo_modules!/,
        offset: 1,
        comment: '#',
      });
      fs.writeFileSync(podfile, result.contents);
      return cfg;
    },
  ]);
};
