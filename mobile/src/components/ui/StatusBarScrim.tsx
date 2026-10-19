import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useStableTopInset } from '../CustomHeader';
import { useCosmos } from '../../theme/cosmos';

/**
 * Page-coloured band under the status bar, so tab content scrolling up never
 * collides with the clock. Render it as the LAST child of the tab's root View
 * (after the ScrollView), never inside the ScrollView: it floats, it takes no
 * layout, so the header clearance rules (mobile-tab-top-spacing) are unchanged.
 */
export default function StatusBarScrim() {
  const c = useCosmos();
  const top = useStableTopInset();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[c.bg, c.bg, `${c.bg}00`]}
      locations={[0, 0.75, 1]}
      style={[styles.scrim, { height: top + 12 }]}
    />
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});
