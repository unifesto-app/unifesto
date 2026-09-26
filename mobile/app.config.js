const withModularHeaders = require('./plugins/withModularHeaders');
// const withAndroidEdgeToEdge = require('./plugins/withAndroidEdgeToEdge');
// const withAndroidEdgeToEdgeStyles = require('./plugins/withAndroidStyles');
const withFirebaseDisableAutoInit = require('./plugins/withFirebaseDisableAutoInit');
const withRemoveOrientationRestrictions = require('./plugins/withRemoveOrientationRestrictions');
const withRemoveSplashScreen = require('./plugins/withRemoveSplashScreen');
const withSceneDelegate = require('./plugins/withSceneDelegate');
const withPodDeploymentTarget = require('./plugins/withPodDeploymentTarget');

module.exports = () => {
  const config = {
    name: "Unifesto",
    slug: "unifesto",
    version: "4.0.0",
    orientation: "default",
    // Light / Dark / System is chosen in-app (ThemeContext); "automatic" lets
    // iOS report the real system scheme so the System option can follow it.
    userInterfaceStyle: "automatic",
    scheme: "unifesto",
    icon: "./assets/app-icon-dark.png",
    // Plain charcoal launch screen (matches dark tokens.bg): the animated JS splash (src/screens/SplashScreen.tsx)
    // brings the wordmark in, so a native logo here would blink out and back.
    splash: {
      backgroundColor: "#0b0b0d"
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
        NSCameraUsageDescription: "We need camera access to let you take photos for your profile picture and join live sessions.",
        NSMicrophoneUsageDescription: "We need microphone access so you can speak in live sessions.",
        NSPhotoLibraryUsageDescription: "Unifesto needs access to your photo library to select photos for your profile picture.",
        NSPhotoLibraryAddUsageDescription: "Unifesto needs permission to save event tickets and QR codes to your photo library.",
        NSUserNotificationsUsageDescription: "We need permission to send you notifications about event updates, ticket confirmations, and important announcements.",
        NSLocationWhenInUseUsageDescription: "Unifesto uses your location to help you discover nearby events and provide location-based event recommendations. Your location data is only used while you're using the app and is never shared with third parties.",
        // Firebase auto-initialization disabled for ATT compliance
        FirebaseAppDelegateProxyEnabled: false,
        FirebaseAnalyticsCollectionEnabled: false,
        FirebaseAnalyticsCollectionDeactivated: true,
        FirebaseScreenReportingEnabled: false,
      },
      associatedDomains: [
        "applinks:unifesto.app",
        "applinks:www.unifesto.app"
      ],
      // Pairs the app with its App Clip (targets/clip, com.unifesto.app.Clip).
      // The clip's own entitlements live in targets/clip/expo-target.config.js.
      entitlements: {
        "com.apple.developer.associated-appclip-app-identifiers": [
          "$(AppIdentifierPrefix)com.unifesto.app.Clip"
        ]
      },
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
        "android.permission.READ_PHONE_STATE",
        "android.permission.READ_DEVICE_CONFIG",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.INTERNET",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.BLUETOOTH_CONNECT"
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
      ],
      // Suppress Android 15 edge-to-edge deprecation warnings
      // These are from React Native/Expo libraries, not our code
      compileSdkVersion: 35,
      targetSdkVersion: 35,
      buildToolsVersion: "35.0.0"
    },
    web: {
      bundler: "metro",
      favicon: "./assets/app-icon-transparent.png"
    },
    plugins: [
      "expo-router",
      // Native targets under targets/ (the App Clip in targets/clip).
      "@bacons/apple-targets",
      "expo-font",
      "expo-web-browser",
      "expo-image",
      "expo-secure-store",
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
          locationWhenInUsePermission: "Unifesto uses your location to help you discover nearby events and communities. Your location is only used while you're using the app and is never shared with third parties."
        }
      ],
      // Undoes onesignal-expo-plugin's aliased Xcode sections (see the file) or
      // @bacons/apple-targets can't parse the project. Must be listed BEFORE
      // OneSignal: Xcode mods run in reverse plugin order, so this runs after it.
      "./plugins/withXcodeDependencyProxyFix",
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
          cameraPermission: "Unifesto uses the camera to scan attendee ticket QR codes when you check people in at events."
        }
      ],
      "@livekit/react-native-expo-plugin",
      // Native venue maps. iOS uses Apple Maps (no key). Android uses Google
      // Maps and needs GOOGLE_MAPS_ANDROID_API_KEY at build time; without it
      // the app falls back to the embedded web map (see VenueMap).
      // "Up next" home-screen widget. iOS: WidgetKit extension built from
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
  modifiedConfig = withFirebaseDisableAutoInit(modifiedConfig);
  modifiedConfig = withRemoveOrientationRestrictions(modifiedConfig);
  modifiedConfig = withRemoveSplashScreen(modifiedConfig);
  modifiedConfig = withSceneDelegate(modifiedConfig);
  // Xcode 27 rejects pods targeting < iOS 15; lift them to the app minimum.
  modifiedConfig = withPodDeploymentTarget(modifiedConfig);
  return modifiedConfig;
};
