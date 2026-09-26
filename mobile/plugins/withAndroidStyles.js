const { withAndroidStyles } = require('@expo/config-plugins');

/**
 * Expo config plugin to add Android 15+ compatible styles
 */
const withAndroidEdgeToEdgeStyles = (config) => {
  return withAndroidStyles(config, async (config) => {
    const styles = config.modResults;
    
    // Add or update the app theme to support edge-to-edge
    if (!styles.resources.style) {
      styles.resources.style = [];
    }
    
    // Find or create the AppTheme
    let appTheme = styles.resources.style.find(
      style => style.$?.name === 'AppTheme'
    );
    
    if (!appTheme) {
      appTheme = {
        $: { name: 'AppTheme', parent: 'Theme.AppCompat.Light.NoActionBar' },
        item: []
      };
      styles.resources.style.push(appTheme);
    }
    
    // Ensure item array exists
    if (!appTheme.item) {
      appTheme.item = [];
    }
    
    // Add edge-to-edge compatible attributes
    const edgeToEdgeItems = [
      {
        $: { name: 'android:windowLayoutInDisplayCutoutMode' },
        _: 'shortEdges'
      },
      {
        $: { name: 'android:windowTranslucentStatus' },
        _: 'false'
      },
      {
        $: { name: 'android:windowTranslucentNavigation' },
        _: 'false'
      },
      {
        $: { name: 'android:enforceNavigationBarContrast' },
        _: 'false'
      },
      {
        $: { name: 'android:enforceStatusBarContrast' },
        _: 'false'
      }
    ];
    
    // Remove old items and add new ones
    edgeToEdgeItems.forEach(newItem => {
      const existingIndex = appTheme.item.findIndex(
        item => item.$?.name === newItem.$.name
      );
      if (existingIndex >= 0) {
        appTheme.item[existingIndex] = newItem;
      } else {
        appTheme.item.push(newItem);
      }
    });
    
    return config;
  });
};

module.exports = withAndroidEdgeToEdgeStyles;
