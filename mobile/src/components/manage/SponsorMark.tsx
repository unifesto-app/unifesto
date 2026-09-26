import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius } from '../../theme/spacing';
import { font } from '../../theme/fontHelpers';
import { initials } from '../../lib/api/spaceSponsors';

/**
 * A sponsor's logo (1:1, never cropped: `contain` on white, since most brand
 * marks are drawn for light backgrounds) or its initials when it has none.
 */
export default function SponsorMark({ name, logoUrl, size = 28 }: { name: string; logoUrl?: string | null; size?: number }) {
  const tokens = useTokens();
  const box = { width: size, height: size, borderRadius: size >= 48 ? borderRadius.md : borderRadius.sm };
  if (logoUrl) {
    return <Image source={{ uri: logoUrl }} style={[box, styles.logo]} contentFit="contain" transition={120} />;
  }
  return (
    <View style={[box, styles.center, { backgroundColor: tokens.elevated }]}>
      <Text style={[styles.initials, { color: tokens.accent, fontSize: Math.round(size * 0.38) }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { backgroundColor: '#ffffff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...font('semibold') },
});
