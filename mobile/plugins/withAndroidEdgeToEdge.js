const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin to fix Android 15+ edge-to-edge deprecation warnings
 * and remove orientation restrictions for large screen devices
 */
const withAndroidEdgeToEdge = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    
    // Find the main application element
    const application = androidManifest.manifest.application?.[0];
    if (!application) {
      return config;
    }

    // Find all activity elements
    const activities = application.activity || [];
    
    activities.forEach((activity) => {
      // Remove screenOrientation restriction from MainActivity
      if (activity.$?.['android:name']?.includes('MainActivity')) {
        delete activity.$['android:screenOrientation'];
        
        // Add resizeableActivity attribute for large screens
        activity.$['android:resizeableActivity'] = 'true';
        
        // Enable edge-to-edge with Android 15+ compatible attributes
        activity.$['android:windowSoftInputMode'] = 'adjustResize';
        
        // Add theme that supports edge-to-edge
        if (!activity.$['android:theme']) {
          activity.$['android:theme'] = '@style/Theme.App.Starting';
        }
      }
    });

    return config;
  });
};

module.exports = withAndroidEdgeToEdge;
