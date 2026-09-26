import { StatusBar } from 'react-native';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import * as SystemUI from 'expo-system-ui';
import { useTheme } from '../../src/context/ThemeContext';
import FloatingTabBar, { TAB_META } from '../../src/navigation/FloatingTabBar';
import { useSpaceAccess } from '../../src/context/SpaceAccessContext';
import usePlatformAdmin from '../../src/hooks/usePlatformAdmin';

// Android: a custom floating capsule (iOS uses the native Liquid Glass bar in
// _layout.ios.tsx). The bar is absolutely positioned, so tab screens scroll
// under it — each keeps ~120px of bottom padding to clear it.
export default function TabsLayout() {
  const { tokens } = useTheme();
  // Operators only (Space Admin, Curator, Co-Curator, Crew, Judge, Mentor).
  const { sections } = useSpaceAccess();
  // Unifesto platform staff only.
  const isPlatformAdmin = usePlatformAdmin();
  const hiddenRoutes = [...(sections.length === 0 ? ['space'] : []), ...(isPlatformAdmin ? [] : ['apex'])];

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(tokens.bg).catch(() => {});
    StatusBar.setTranslucent(false);
    StatusBar.setBackgroundColor(tokens.bg);
    StatusBar.setBarStyle(tokens.scheme === 'dark' ? 'light-content' : 'dark-content');
  }, [tokens.bg, tokens.scheme]);

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} hiddenRoutes={hiddenRoutes} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: tokens.bg } }}
    >
      {Object.entries(TAB_META).map(([name, meta]) => (
        <Tabs.Screen key={name} name={name} options={{ title: meta.label }} />
      ))}
    </Tabs>
  );
}
