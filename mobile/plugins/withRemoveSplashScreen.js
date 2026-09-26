const {
  withAndroidColorsNight,
  withDangerousMod,
  withInfoPlist,
  withAndroidManifest,
  withAndroidStyles,
  withAndroidColors,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Remove Expo's default splash screen to use only custom React Native splash
 */
const withRemoveSplashScreen = (config) => {
  // NOTE: Do NOT remove UILaunchStoryboardName — removing it causes
  // the app window to not size correctly on iOS (black gaps top/bottom).
  // config = withInfoPlist(config, (config) => {
  //   delete config.modResults.UILaunchStoryboardName;
  //   return config;
  // });

  // Change Android MainActivity theme from splash to AppTheme
  config = withAndroidManifest(config, (config) => {
    const mainActivity = config.modResults.manifest.application[0].activity.find(
      (activity) => activity.$['android:name'] === '.MainActivity'
    );
    if (mainActivity) {
      mainActivity.$['android:theme'] = '@style/AppTheme';
    }
    return config;
  });

  // Remove splash screen styles from Android
  config = withAndroidStyles(config, (config) => {
    const styles = config.modResults.resources.style;
    if (styles) {
      // Remove Theme.App.SplashScreen style
      config.modResults.resources.style = styles.filter(
        (style) => style.$?.name !== 'Theme.App.SplashScreen'
      );

      // MainActivity now runs under AppTheme, but expo-splash-screen still
      // calls SplashScreenManager.registerOnActivity(), which drives
      // androidx.core:core-splashscreen. On pre-Android-12 devices that
      // library inflates its splash_screen_view.xml, whose ImageView is
      // sized with ?attr/splashScreenIconSize. If the active theme doesn't
      // define that attr, inflation throws:
      //   UnsupportedOperationException: Failed to resolve attribute ...
      // (Android 12+ renders the splash natively and never hits this path,
      // which is why the crash only shows up on older phones.)
      // Define the attrs on AppTheme so inflation succeeds; with no
      // animated-icon drawable the splash is just a black frame, matching
      // our custom React Native splash.
      const appTheme = config.modResults.resources.style.find(
        (style) => style.$?.name === 'AppTheme'
      );
      if (appTheme) {
        appTheme.item = appTheme.item || [];
        const setItem = (name, value) => {
          const existing = appTheme.item.find((i) => i.$?.name === name);
          if (existing) {
            existing._ = value;
          } else {
            appTheme.item.push({ $: { name }, _: value });
          }
        };
        setItem('splashScreenIconSize', '48dp');
        // Day/night colour (values/ + values-night/ launch_background below) so
        // the frame matches the OS theme like the iOS launch storyboard does.
        setItem('windowSplashScreenBackground', '@color/launch_background');
        setItem('windowSplashScreenAnimationDuration', '0');
        // Android 12+ always draws a system splash from the activity theme
        // and falls back to the launcher icon when no animated icon is set.
        // That icon splash, followed by our JS splash, read as a "double
        // splash". A transparent icon leaves just the black frame.
        setItem('windowSplashScreenAnimatedIcon', '@android:color/transparent');
        setItem('android:windowSplashScreenBackground', '@color/launch_background');
        setItem('android:windowSplashScreenAnimatedIcon', '@android:color/transparent');
      }
    }
    return config;
  });

  // Launch frame colour per OS theme — matches lightTokens.bg / darkTokens.bg.
  const setLaunchBackground = (resources, value) => {
    const colors = (resources.color || []).filter(
      (color) => color.$?.name !== 'launch_background'
    );
    colors.push({ $: { name: 'launch_background' }, _: value });
    resources.color = colors;
  };

  // Remove splash screen colors from Android
  config = withAndroidColors(config, (config) => {
    const colors = config.modResults.resources.color;
    if (colors) {
      // Remove splashscreen_background color
      config.modResults.resources.color = colors.filter(
        (color) => color.$?.name !== 'splashscreen_background'
      );
    }
    setLaunchBackground(config.modResults.resources, '#f2f2f5');
    return config;
  });

  config = withAndroidColorsNight(config, (config) => {
    setLaunchBackground(config.modResults.resources, '#000000');
    return config;
  });

  // Remove iOS SplashScreen files
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosPath = path.join(projectRoot, 'ios', config.modRequest.projectName || 'Unifesto');
      

      // Remove splash screen assets
      const splashLogoPath = path.join(iosPath, 'Images.xcassets', 'SplashScreenLogo.imageset');
      if (fs.existsSync(splashLogoPath)) {
        fs.rmSync(splashLogoPath, { recursive: true, force: true });
      }

      const splashBgPath = path.join(iosPath, 'Images.xcassets', 'SplashScreenBackground.colorset');
      if (fs.existsSync(splashBgPath)) {
        fs.rmSync(splashBgPath, { recursive: true, force: true });
      }

      return config;
    },
  ]);

  // Remove Android splash screen images
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
      
      // Remove splashscreen_logo.png from all drawable folders
      const drawableFolders = [
        'drawable-mdpi',
        'drawable-hdpi',
        'drawable-xhdpi',
        'drawable-xxhdpi',
        'drawable-xxxhdpi',
      ];

      for (const folder of drawableFolders) {
        const splashPath = path.join(resPath, folder, 'splashscreen_logo.png');
        if (fs.existsSync(splashPath)) {
          fs.unlinkSync(splashPath);
        }
      }

      // Replace ic_launcher_background.xml with solid black (removes splashscreen_logo reference)
      const launcherBgPath = path.join(resPath, 'drawable', 'ic_launcher_background.xml');
      if (fs.existsSync(launcherBgPath)) {
        const cleanXml = `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android">\n  <solid android:color="#000000"/>\n</shape>`;
        fs.writeFileSync(launcherBgPath, cleanXml, 'utf8');
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withRemoveSplashScreen;
