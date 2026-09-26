/**
 * Expo Config Plugin: Disable Firebase Auto-Initialization
 * 
 * This plugin ensures Firebase does NOT auto-initialize on app start.
 * This is CRITICAL for Apple ATT compliance.
 * 
 * What it does:
 * - iOS: Adds Firebase config keys to Info.plist to disable auto-init
 * - Android: Adds meta-data to AndroidManifest.xml to disable auto-init
 * 
 * Without this, Firebase will collect identifiers BEFORE ATT consent,
 * causing App Store rejection.
 */

const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Add Firebase disable keys to iOS Info.plist
 */
function withFirebaseDisableAutoInitIOS(config) {
  return withInfoPlist(config, (config) => {
    // Disable Firebase auto-initialization
    config.modResults.FirebaseAppDelegateProxyEnabled = false;
    config.modResults.FirebaseAnalyticsCollectionEnabled = false;
    config.modResults.FirebaseAnalyticsCollectionDeactivated = true;
    
    // Disable automatic screen tracking
    config.modResults.FirebaseScreenReportingEnabled = false;
    
    console.log('✅ Firebase auto-initialization disabled for iOS');
    
    return config;
  });
}

/**
 * Add Firebase disable meta-data to Android AndroidManifest.xml
 */
function withFirebaseDisableAutoInitAndroid(config) {
  return withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    
    // Ensure tools namespace is declared in manifest
    if (!config.modResults.manifest.$) {
      config.modResults.manifest.$ = {};
    }
    config.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }
    
    // Remove existing Firebase meta-data if present
    mainApplication['meta-data'] = mainApplication['meta-data'].filter(
      (meta) => 
        meta.$['android:name'] !== 'firebase_analytics_collection_enabled' &&
        meta.$['android:name'] !== 'firebase_analytics_collection_deactivated' &&
        meta.$['android:name'] !== 'google_analytics_automatic_screen_reporting_enabled'
    );
    
    // Add Firebase disable meta-data with tools:replace to override conflicts
    mainApplication['meta-data'].push(
      {
        $: {
          'android:name': 'firebase_analytics_collection_enabled',
          'android:value': 'false',
          'tools:replace': 'android:value',
        },
      },
      {
        $: {
          'android:name': 'firebase_analytics_collection_deactivated',
          'android:value': 'true',
          'tools:replace': 'android:value',
        },
      },
      {
        $: {
          'android:name': 'google_analytics_automatic_screen_reporting_enabled',
          'android:value': 'false',
          'tools:replace': 'android:value',
        },
      }
    );
    
    console.log('✅ Firebase auto-initialization disabled for Android');
    
    return config;
  });
}

/**
 * Main plugin function
 */
module.exports = function withFirebaseDisableAutoInit(config) {
  // Apply iOS modifications
  config = withFirebaseDisableAutoInitIOS(config);
  
  // Apply Android modifications
  config = withFirebaseDisableAutoInitAndroid(config);
  
  return config;
};
