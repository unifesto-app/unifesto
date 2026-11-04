const fs = require('fs');
const path = require('path');
const { IOSConfig } = require('@expo/config-plugins');

/**
 * iOS App Shortcuts ("My tickets", "Find events", "Scan tickets") for Spotlight,
 * Siri and the Shortcuts app. The Swift is AppShortcuts.swift next to this file.
 * It goes into the main app target, not a pod: Xcode's App Intents metadata step
 * only reads the app's own sources for the AppShortcutsProvider.
 */
module.exports = (config) =>
  IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: 'AppShortcuts.swift',
    contents: fs.readFileSync(path.join(__dirname, 'AppShortcuts.swift'), 'utf8'),
    overwrite: true,
  });
