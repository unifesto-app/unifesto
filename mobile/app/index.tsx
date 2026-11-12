import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useLaunchGate } from '../src/lib/launchGate';
import { cosmosFor } from '../src/theme/cosmos';
import { launchScheme } from '../src/context/ThemeContext';

/**
 * The launch route. The splash plays over it from the root layout; this goes
 * to the tabs once auth has loaded and the splash lets Home mount (after its
 * intro, while its letters are still). Always the tabs: profile completion is
 * a banner there, not a forced screen. If auth ever outlasts the splash (it
 * leaves by 30s), a spinner says it is still working instead of a blank screen.
 */
export default function Index() {
  const { isLoading } = useAuth();
  const { appMayMount, done } = useLaunchGate();
  if (!isLoading && appMayMount) return <Redirect href="/(tabs)" />;
  const c = cosmosFor(launchScheme);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      {done ? <ActivityIndicator color={c.muted} accessibilityLabel="Loading" /> : null}
    </View>
  );
}
