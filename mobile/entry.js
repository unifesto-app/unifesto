// Custom entry: things that must run before Expo Router eagerly requires the
// route files at startup. `expo-router/entry` is loaded with require() (not
// import) so it runs last, rather than being hoisted like an ESM import.

// First import, so crashes during startup are reported too.
import './src/lib/sentry';

// Android home-screen widgets render in a headless JS task that can start with
// the app closed, so the handler must be registered before the router loads.
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require('react-native').Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  registerWidgetTaskHandler(require('./src/widgets/android/widgetTaskHandler').widgetTaskHandler);
}

require('expo-router/entry');
