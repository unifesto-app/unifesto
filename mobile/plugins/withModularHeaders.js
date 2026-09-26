const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Custom Expo config plugin for Firebase's Podfile needs:
 *  - use_modular_headers! so Firebase works with static libraries
 *  - $RNFirebaseDisableSPM so react-native-firebase (v26+) pulls the Firebase
 *    SDK from CocoaPods instead of Swift Package Manager. SPM + static linkage
 *    fails `pod install` (duplicate Firebase copies per target).
 */
const withModularHeaders = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf-8');
        
        // Add use_modular_headers! after platform declaration if not already present
        if (!podfileContent.includes('use_modular_headers!')) {
          podfileContent = podfileContent.replace(
            /(platform :ios.*\n)/,
            '$1\n# Fix for Firebase static library issue\nuse_modular_headers!\n'
          );
        }

        // Must be set before any target block.
        if (!podfileContent.includes('$RNFirebaseDisableSPM')) {
          podfileContent = podfileContent.replace(
            /(platform :ios.*\n)/,
            '$1\n# react-native-firebase: use CocoaPods, not SPM (see plugin header)\n$RNFirebaseDisableSPM = true\n'
          );
        }

        fs.writeFileSync(podfilePath, podfileContent);
      }
      
      return config;
    },
  ]);
};

module.exports = withModularHeaders;
