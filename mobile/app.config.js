const withModularHeaders = require('./plugins/withModularHeaders');
// const withAndroidEdgeToEdge = require('./plugins/withAndroidEdgeToEdge');
// const withAndroidEdgeToEdgeStyles = require('./plugins/withAndroidStyles');
const withRemoveOrientationRestrictions = require('./plugins/withRemoveOrientationRestrictions');
const withRemoveSplashScreen = require('./plugins/withRemoveSplashScreen');
const withSceneDelegate = require('./plugins/withSceneDelegate');
const withPodDeploymentTarget = require('./plugins/withPodDeploymentTarget');

module.exports = () => {
  const config = {
    name: "Unifesto",
    slug: "unifesto",
    version: "4.0.5",
    // Native app only. Without this Expo defaults to ["ios", "android", "web"],
    // so `eas update` (platform "all") also tried to bundle web and failed,
    // which is why OTAs needed the --skip-bundler recipe. Part of the runtime
    // fingerprint: landed for the 5.0.0 store build (version-5 O1).
    platforms: ["ios", "android"],
    // OTA updates (EAS Update). "fingerprint" hashes the native layer, so an
    // update only reaches binaries built from the same native code: adding a
    // native module forces a store build instead of crashing old installs.
    // Publish with `npm run update:production` so the env (and therefore the
    // fingerprint) matches the EAS build.
    runtimeVersion: {
      policy: "fingerprint"
    },
    updates: {
      url: "https://u.expo.dev/63cae7f2-fb5a-4891-a98f-0ffc04e6c3ad",
      // Never block launch on the network: a downloaded update is applied on
      // the next cold start (see src/lib/otaUpdate.ts).
      fallbackToCacheTimeout: 0
    },
    orientation: "default",
    // Light / Dark / System is chosen in-app (ThemeContext); "automatic" lets
    // iOS report the real system scheme so the System option can follow it.
    userInterfaceStyle: "automatic",
    scheme: "unifesto",
    icon: "./assets/app-icon-dark.png",
    // Plain black launch screen (the brand night): the animated JS splash (src/screens/SplashScreen.tsx)
    // brings the wordmark in, so a native logo here would blink out and back.
    splash: {
      backgroundColor: "#000000"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.unifesto.app",
      appleTeamId: "9AH3Z5C5DH",
      icon: "./assets/app-icon-light.png",
      googleServicesFile: "./GoogleService-Info.plist",
      appStoreUrl: "https://apps.apple.com/in/app/unifesto-discover-events/id6767165496",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        // Camera, microphone and location strings are set by the expo-camera and
        // expo-location plugins below (a plugin overwrites these keys at prebuild).
        NSPhotoLibraryUsageDescription: "Unifesto uses your photo library so you can choose a profile photo, event covers, space logos and banners, and images for registration questions.",
        NSPhotoLibraryAddUsageDescription: "Unifesto needs permission to save event tickets and QR codes to your photo library.",
        // Push goes through OneSignal, so Firebase must not swizzle the app delegate.
        FirebaseAppDelegateProxyEnabled: false,
      },
      associatedDomains: [
        "applinks:unifesto.app",
        "applinks:www.unifesto.app"
      ],
      usesAppleSignIn: true
    },
    android: {
      package: "com.unifesto.app",
      icon: "./assets/app-icon-dark.png",
      googleServicesFile: "./google-services.json",
      playStoreUrl: "https://play.google.com/store/apps/details?id=com.unifesto.app",
      // Foreground is the iOS "u" icon shrunk to ~2/3 and padded, because
      // Android masks adaptive icons to the centre 72dp of a 108dp canvas.
      adaptiveIcon: {
        foregroundImage: "./assets/app-icon-android-foreground.png",
        // Android 13+ themed icons: white "u" on transparent, same framing as
        // the foreground; the launcher tints it to the wallpaper palette.
        monochromeImage: "./assets/app-icon-android-monochrome.png",
        backgroundColor: "#000000"
      },
      permissions: [
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.INTERNET",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.BLUETOOTH_CONNECT"
      ],
      // Never used, and sensitive for Play review; stripped even if a library's
      // manifest merges them back in.
      blockedPermissions: [
        "android.permission.READ_PHONE_STATE",
        "android.permission.READ_DEVICE_CONFIG",
        "android.permission.SYSTEM_ALERT_WINDOW"
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "unifesto.app",
              pathPrefix: "/event"
            },
            {
              scheme: "https",
              host: "unifesto.app",
              pathPrefix: "/space"
            },
            {
              scheme: "https",
              host: "unifesto.app",
              pathPrefix: "/signup"
            },
            {
              scheme: "https",
              host: "unifesto.app",
              pathPrefix: "/session"
            },
            {
              scheme: "https",
              host: "unifesto.app",
              pathPrefix: "/huddle"
            },
            {
              scheme: "https",
              host: "unifesto.app",
              pathPrefix: "/claim"
            },
            {
              scheme: "https",
              host: "www.unifesto.app",
              pathPrefix: "/event"
            },
            {
              scheme: "https",
              host: "www.unifesto.app",
              pathPrefix: "/space"
            },
            {
              scheme: "https",
              host: "www.unifesto.app",
              pathPrefix: "/signup"
            },
            {
              scheme: "https",
              host: "www.unifesto.app",
              pathPrefix: "/session"
            },
            {
              scheme: "https",
              host: "www.unifesto.app",
              pathPrefix: "/huddle"
            },
            {
              scheme: "https",
              host: "www.unifesto.app",
              pathPrefix: "/claim"
            }
          ],
          category: [
            "BROWSABLE",
            "DEFAULT"
          ]
        },
        {
          action: "VIEW",
          data: [
            {
              scheme: "unifesto"
            }
          ],
          category: [
            "BROWSABLE",
            "DEFAULT"
          ]
        }
      ]
    },
    web: {
      bundler: "metro",
      favicon: "./assets/app-icon-transparent.png"
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser",
      "expo-image",
      // Tokens only, no biometric unlock, so this prompt is never shown. The key
      // must still exist: App Store processing rejects binaries that link the
      // API without a purpose string (ITMS-90683), so it's honest, not generic.
      ["expo-secure-store", { faceIDPermission: "Unifesto doesn't use Face ID. Your sign-in is stored securely on this device." }],
      "expo-sharing",
      "@react-native-community/datetimepicker",
      "expo-splash-screen",
      // Android is always edge-to-edge (SDK 54+), so bar background colours no
      // longer exist; only the icon style is configurable. Light icons suit the
      // dark launch screen; ThemeContext's <StatusBar> takes over at runtime.
      ["expo-status-bar", { style: "light" }],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Unifesto uses your location to help you discover nearby events and communities. Your location is only used while you're using the app and is never shared with third parties.",
          // Foreground only: background location and motion are never requested,
          // so these prompts are never shown. The keys must still exist because
          // expo-location links those APIs and App Store processing rejects
          // binaries without them (ITMS-90683). Honest text, not the generic
          // "Allow $(PRODUCT_NAME)..." defaults.
          locationAlwaysAndWhenInUsePermission: "Unifesto only uses your location while you're using the app, to show events in your city.",
          locationAlwaysPermission: "Unifesto only uses your location while you're using the app, to show events in your city.",
          motionUsagePermission: "Unifesto doesn't use motion or fitness data. This is only declared by a location component the app includes."
        }
      ],
      [
        "onesignal-expo-plugin",
        {
          mode: "production",
          // Must match the app's minimum iOS (16.4 since Expo SDK 56). The
          // plugin otherwise defaults the extension to 11.0, which current
          // OneSignalXCFramework pods refuse to install against.
          iPhoneDeploymentTarget: "16.4"
        }
      ],
      "@react-native-firebase/app",
      "@react-native-firebase/crashlytics",
      "expo-dev-client",
      ["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.1013647520532-kv0g8vf89h92l0s63vgj7jdfilqp41qq" }],
      [
        "expo-camera",
        {
          cameraPermission: "Unifesto uses the camera to scan ticket QR codes at event check-in and sponsor booths, take profile and event photos, and show your video in live sessions.",
          microphonePermission: "Unifesto uses the microphone so you can speak in live sessions."
        }
      ],
      "@livekit/react-native-expo-plugin",
      // Crash + JS error reporting (src/lib/sentry.ts). The plugin also adds the
      // source-map / dSYM upload build steps, authed by the SENTRY_AUTH_TOKEN
      // EAS env var.
      ["@sentry/react-native/expo", { organization: "unifesto", project: "unifesto-mobile", url: "https://sentry.io/" }],
      // Alternate app icons, picked in Profile › Appearance. Art comes from
      // marketing/brand-2026 (build.py ALT_ICONS → render.py alt-icon). iOS's
      // default is Day and Android's is Night, so choosing those resets instead.
      // Names must match APP_ICONS in src/lib/appIcon.ts. Needs a native rebuild.
      [
        "expo-alternate-app-icons",
        ["Night", "Day", "Aurora", "Nebula", "Ember", "Ocean", "Mono"].map((name) => ({
          name,
          ios: `./assets/app-icons/${name.toLowerCase()}.png`,
          android: {
            foregroundImage: `./assets/app-icons/${name.toLowerCase()}-android.png`,
            backgroundColor: name === "Day" ? "#ffffff" : "#000000",
          },
        })),
      ],
      // Native venue maps. iOS uses Apple Maps (no key). Android uses Google
      // Maps and needs GOOGLE_MAPS_ANDROID_API_KEY at build time; without it
      // the app falls back to the embedded web map (see VenueMap).
      // "Up next" and "Countdown" home-screen widgets. iOS: WidgetKit extension built from
      // src/widgets/ios (expo-widgets). Android: AppWidget rendered by
      // react-native-android-widget from src/widgets/android. Both read what
      // the Home tab syncs (src/widgets/sync.ts). Needs a native rebuild.
      [
        "expo-widgets",
        {
          bundleIdentifier: "com.unifesto.app.widgets",
          groupIdentifier: "group.com.unifesto.app",
          widgets: [
            {
              name: "UpNext",
              displayName: "Up next",
              description: "Your next event, counting down.",
              ios: {
                supportedFamilies: ["systemSmall", "systemMedium", "accessoryRectangular", "accessoryInline"]
              }
            },
            {
              name: "Countdown",
              displayName: "Countdown",
              description: "Days to go until your next event.",
              ios: {
                supportedFamilies: ["systemSmall", "accessoryCircular", "accessoryRectangular"]
              }
            }
          ]
        }
      ],
      [
        "react-native-android-widget",
        {
          widgets: [
            {
              name: "UpNext",
              label: "Up next",
              description: "Your next event, counting down.",
              minWidth: "180dp",
              minHeight: "110dp",
              targetCellWidth: 3,
              targetCellHeight: 2,
              resizeMode: "horizontal|vertical",
              // Android's floor is 30 min; keeps "Starts in 2h" roughly honest with the app closed.
              updatePeriodMillis: 1800000
            },
            {
              name: "Countdown",
              label: "Countdown",
              description: "Days to go until your next event.",
              minWidth: "110dp",
              minHeight: "110dp",
              targetCellWidth: 2,
              targetCellHeight: 2,
              resizeMode: "horizontal|vertical",
              updatePeriodMillis: 1800000
            }
          ]
        }
      ],
      [
        "react-native-maps",
        {
          androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY || ""
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "63cae7f2-fb5a-4891-a98f-0ffc04e6c3ad"
      },
      // Read at runtime to decide native vs web map on Android.
      hasAndroidMapsKey: !!process.env.GOOGLE_MAPS_ANDROID_API_KEY
    }
  };

  // Apply custom plugins and return the modified config
  let modifiedConfig = withModularHeaders(config);
  // Disabled edge-to-edge plugins to fix status bar overlap on Android
  // modifiedConfig = withAndroidEdgeToEdge(modifiedConfig);
  // modifiedConfig = withAndroidEdgeToEdgeStyles(modifiedConfig);
  modifiedConfig = withRemoveOrientationRestrictions(modifiedConfig);
  modifiedConfig = withRemoveSplashScreen(modifiedConfig);
  modifiedConfig = withSceneDelegate(modifiedConfig);
  // Xcode 27 rejects pods targeting < iOS 15; lift them to the app minimum.
  modifiedConfig = withPodDeploymentTarget(modifiedConfig);
  return modifiedConfig;
};
