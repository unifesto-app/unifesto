// Expo's default config plus Sentry's debug-ID serializer, so uploaded source
// maps match the bundle (store builds upload automatically; OTA: docs/OTA.md).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Fix for fast refresh issues
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

// Increase file watcher stability
config.watchFolders = [__dirname];

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => middleware,
};

// Disable problematic cache
config.cacheVersion = Date.now().toString();

module.exports = config;
