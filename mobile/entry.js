// Custom entry: LiveKit's WebRTC globals and its DOMException polyfill must be
// installed BEFORE Expo Router eagerly requires the route files at startup —
// some routes import `livekit-client`, which references `DOMException` at module
// evaluation time. Importing `@livekit/react-native` installs the DOMException
// polyfill as a side-effect; registerGlobals() adds the WebRTC globals.
//
// `expo-router/entry` is loaded with require() (not import) so it runs AFTER
// registerGlobals(), rather than being hoisted above it like an ESM import.
import { registerGlobals } from '@livekit/react-native';
import { setLogLevel, LogLevel } from 'livekit-client';

registerGlobals();

// Quiet the live-room log flood. LiveKit's own INFO lines (connection state,
// track publishing, signal connecting, …) drop to warnings-and-above; the
// `debug` package that react-native-webrtc uses for its per-frame
// `rn-webrtc:*` DEBUG spam is turned off entirely.
setLogLevel(LogLevel.warn);
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('debug').disable();
} catch {
  // `debug` not resolvable — nothing to silence.
}

require('expo-router/entry');
