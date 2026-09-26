import React from 'react';
import { View, StyleSheet } from 'react-native';
import SpaceScreen from '../../src/screens/SpaceScreen';
import { useTheme } from '../../src/context/ThemeContext';

// Operator tab (Space Admin · Curator · Co-Curator · Crew · Judge · Mentor).
// Hidden for everyone else by the tab layouts via useSpaceAccess(). Same thin
// opaque wrapper as Profile/Tickets so the native tab host doesn't double the
// safe-area top inset.
export default function SpaceTab() {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SpaceScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
