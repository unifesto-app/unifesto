import React from 'react';
import { View, StyleSheet } from 'react-native';
import TicketsScreen from '../../src/screens/TicketsScreen';
import { useTheme } from '../../src/context/ThemeContext';

// Tickets is a primary attendee action (registrations + door QR), so it lives on
// the tab bar. TicketsScreen renders its own header, so this is a thin wrapper
// mirroring the other tab screens.
export default function TicketsTab() {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
  });

  return (
    <View style={styles.container}>
      <TicketsScreen />
    </View>
  );
}
