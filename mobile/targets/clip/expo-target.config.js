// App Clip: a tiny native SwiftUI app (no React Native) that opens from
// unifesto.app/event/<slug> links, Safari's App Clip card, QR and App Clip
// Codes. It previews the event and offers the full app via the App Store
// overlay. Linked into the Xcode project at prebuild by @bacons/apple-targets.
//
// The clip writes the event it showed into the shared app group; the full app
// picks that up on first launch (modules/clip-handoff) and opens the same event.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'clip',
  name: 'UnifestoClip',
  displayName: 'Unifesto',
  // → com.unifesto.app.Clip (must stay in sync with the AASA `appclips` entry
  // in websites/web/src/app/.well-known/apple-app-site-association/route.ts).
  bundleIdentifier: '.Clip',
  // iOS 17+ lifts the clip size cap to 100 MB for link invocations; the
  // physical-code limit stays 15 MB, which this SwiftUI-only clip is far below.
  deploymentTarget: '17.0',
  // Pure SwiftUI. apple-targets defaults clips to embedding the RN bundle,
  // which would add a Metro build phase and megabytes the clip never runs.
  exportJs: false,
  icon: '../../assets/app-icon-light.png',
  colors: {
    $accent: '#3491ff',
    clipBackground: '#0b0b0d',
    clipElevated: '#1a1a1d',
    clipTextSecondary: '#94a3b8',
  },
  frameworks: ['SwiftUI', 'StoreKit'],
  entitlements: {
    // parent-application-identifiers is added by the plugin for `clip` targets.
    'com.apple.developer.associated-domains': [
      'appclips:unifesto.app',
      'appclips:www.unifesto.app',
    ],
    // Same group the widget uses; the full app reads the handoff from it.
    'com.apple.security.application-groups': ['group.com.unifesto.app'],
  },
});
