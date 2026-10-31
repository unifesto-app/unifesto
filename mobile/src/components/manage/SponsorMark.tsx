import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { cosmosFont, useCosmos } from '../../theme/cosmos';
import { initials } from '../../lib/api/spaceSponsors';

/**
 * A sponsor's logo (1:1, never cropped: `contain` on white, since most brand
 * marks are drawn for light backgrounds) or its initials when it has none.
 */
export default function SponsorMark({ name, logoUrl, size = 28 }: { name: string; logoUrl?: string | null; size?: number }) {
  const c = useCosmos();
  // Rounded like the other cosmos marks: a quarter of the side, never a square box.
  const box = { width: size, height: size, borderRadius: Math.round(size / 4) };
  if (logoUrl) {
    return <Image source={{ uri: logoUrl }} style={[box, styles.logo]} contentFit="contain" transition={120} />;
  }
  return (
    <View style={[box, styles.center, { backgroundColor: c.tint }]}>
      <Text style={[styles.initials, { color: c.text, fontSize: Math.round(size * 0.34) }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Brand marks are drawn for white, like the QR panel: the one fixed white.
  logo: { backgroundColor: '#ffffff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...cosmosFont.strong },
});
