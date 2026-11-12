import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useLaunchGate } from '../src/lib/launchGate';
import { cosmosFor } from '../src/theme/cosmos';
import { launchScheme } from '../src/context/ThemeContext';

/**
 * The launch route. The splash plays over it from the root layout; this goes
 * to the tabs once auth has loaded and the splash lets Home mount (after its
 * intro, so Home's first render never costs the letters frames). Always the
 * tabs: profile completion is a banner there, not a forced screen.
 */
export default function Index() {
  const { isLoading } = useAuth();
  const { appMayMount } = useLaunchGate();
  if (isLoading || !appMayMount) return <View style={{ flex: 1, backgroundColor: cosmosFor(launchScheme).bg }} />;
  return <Redirect href="/(tabs)" />;
}
