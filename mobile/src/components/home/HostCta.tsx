import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AuthButton from '../auth/AuthButton';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import { GUTTER } from './Section';

/**
 * Closing band for people who only attend (the web's FinalCTASection): the
 * other side of the door, one silver button into a Space request.
 */
export default function HostCta({ onPress }: { onPress: () => void }) {
  const c = useCosmos();
  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <View style={[styles.card, { backgroundColor: LIQUID_GLASS ? undefined : c.raised }]}>
        <GlassFill radius={cosmosCardRadius} />
        <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
        <Text style={[styles.title, { color: c.text }]}>Run your own event</Text>
        <Text style={[styles.body, { color: c.soft }]}>
          Tickets, QR check-in and payouts for your club or community. Free for RSVP events.
        </Text>
        <AuthButton label="Request a space" arrow onPress={onPress} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  title: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  body: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  button: { marginTop: spacing[6], alignSelf: 'flex-start' },
});
