import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { Button } from '../ui';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';

/** Centered icon + title + body + one action. Used for expired / no tickets / not found. */
export function StateView({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action: string;
  onAction: () => void;
}) {
  const tokens = useTokens();
  return (
    <View style={[styles.state, { backgroundColor: tokens.bg }]}>
      {icon}
      <Text style={[styles.title, { color: tokens.text }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: tokens.textMuted }]}>{body}</Text> : null}
      <Button label={action} size="lg" onPress={onAction} style={{ marginTop: spacing[8], alignSelf: 'stretch' }} />
    </View>
  );
}

/**
 * Non-dismissible cover while a completed payment is verified: swallows every
 * touch so the pay step can't be re-submitted (which would create a second order).
 */
export function VerifyingOverlay({ visible }: { visible: boolean }) {
  const tokens = useTokens();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={[styles.card]}>
          <CardBackdrop shape={styles.card} />
          <ActivityIndicator size="large" color={tokens.accent} />
          <Text style={[styles.cardTitle, { color: tokens.text }]}>Confirming your payment</Text>
          <Text style={[styles.body, { color: tokens.textMuted }]}>Please keep the app open. This only takes a moment.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8] },
  title: { marginTop: spacing[5], fontSize: typography.fontSize.xl, textAlign: 'center', ...font('heading') },
  body: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    maxWidth: 300,
    ...font(),
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: spacing[8] },
  card: { width: '100%', borderRadius: 22, padding: spacing[8], alignItems: 'center', gap: spacing[3] },
  cardTitle: { marginTop: spacing[2], fontSize: typography.fontSize.lg, ...font('heading') },
});
