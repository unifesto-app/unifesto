const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

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
