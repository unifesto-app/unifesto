const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

/**
 * Adopts the UIScene life cycle on iOS.
 *
 * Apps built with the iOS 27 SDK (Xcode 27) crash at launch with EXC_BREAKPOINT in
 * `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` unless they declare a
 * scene delegate. Expo 57 ships `ExpoAppSceneDelegate` (ObjC name EXExpoAppSceneDelegate),
 * which creates the window and starts React Native from the connecting scene, but the
 * prebuild template still starts RN from the app delegate. This plugin:
 *  - registers EXExpoAppSceneDelegate in Info.plist (UIApplicationSceneManifest)
 *  - makes AppDelegate an ExpoReactNativeFactoryProvider (so the scene delegate can find the factory)
 *  - drops the app-delegate window + startReactNative (the scene delegate does both)
 */
const withSceneInfoPlist = (config) =>
  withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return config;
  });

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('withSceneDelegate: expected a Swift AppDelegate');
    }
    let src = config.modResults.contents;

    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(
        /class AppDelegate: ExpoAppDelegate \{/,
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
      );
    }

    src = src.replace(/^[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n/m, '');
    src = src.replace(/^[ \t]*factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\n/m, '');

    // react-native-firebase anchors its configure() call on `factory.startReactNative(`;
    // if that plugin ran after us it found no anchor, so make sure Firebase still starts.
    if (!src.includes('FirebaseApp.configure()')) {
      src = src.replace(
        /^([ \t]*)return super\.application\(application, didFinishLaunchingWithOptions/m,
        '$1FirebaseApp.configure()\n$&'
      );
    }

    config.modResults.contents = src;
    return config;
  });

module.exports = (config) => withSceneAppDelegate(withSceneInfoPlist(config));
