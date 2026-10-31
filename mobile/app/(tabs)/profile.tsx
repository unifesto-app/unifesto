import React from 'react';
import { View, StyleSheet } from 'react-native';
import ProfileScreen from '../../src/screens/ProfileScreen';
import { useCosmos } from '../../src/theme/cosmos';

// Profile is the account hub: Notifications, Support, Edit profile, etc.
// Thin wrapper mirroring the Tickets tab: an OPAQUE root View (backgroundColor
// set) so the native tab host lets the inner ScrollView's
// contentInsetAdjustmentBehavior="never" suppress the safe-area top inset. A
// transparent root here made the host re-apply that inset on top of
// CustomHeader's own notch spacer — the extra top space Profile used to show.
// ProfileScreen paints the Horizon sky (CosmosBackdrop) over this ground.
export default function ProfileTab() {
  const c = useCosmos();

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ProfileScreen />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
