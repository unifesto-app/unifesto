import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AuthButton from '../auth/AuthButton';
import { CardBackdrop, CardSurfaceProvider } from '../ui/CardSurface';
import { column, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import Modal from '../ui/Modal';

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
  const c = useCosmos();
  return (
    <View style={styles.state}>
      {icon}
      <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{title}</Text>
      {body ? <Text style={[styles.body, { color: c.muted }]}>{body}</Text> : null}
      <AuthButton label={action} onPress={onAction} style={styles.action} />
    </View>
  );
}

/**
 * Non-dismissible cover while a completed payment is verified: swallows every
 * touch so the pay step can't be re-submitted (which would create a second order).
 */
export function VerifyingOverlay({ visible }: { visible: boolean }) {
  const c = useCosmos();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        {/* Floating over the flow, so it takes the alert's glass. */}
        <View style={styles.card} accessible accessibilityLiveRegion="polite">
          <CardSurfaceProvider kind="glass">
            <CardBackdrop opaque shape={styles.card} />
          </CardSurfaceProvider>
          <ActivityIndicator size="large" color={c.text} />
          <Text style={[styles.cardTitle, { color: c.text }]}>Confirming your payment</Text>
          <Text style={[styles.body, { color: c.muted }]}>Please keep the app open. This only takes a moment.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8] },
  title: { marginTop: spacing[5], fontSize: 22, lineHeight: 28, textAlign: 'center', ...cosmosFont.display },
  body: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    maxWidth: 300,
    ...cosmosFont.body,
  },
  action: { marginTop: spacing[8], alignSelf: 'stretch' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: spacing[8] },
  card: { ...column, borderRadius: cosmosCardRadius, padding: spacing[8], alignItems: 'center', gap: spacing[3] },
  cardTitle: { marginTop: spacing[2], fontSize: typography.fontSize.lg, ...cosmosFont.strong },
});
