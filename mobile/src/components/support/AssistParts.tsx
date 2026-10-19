import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import type { AssistAction } from '../../lib/api/support';
import { cancelMyRegistration } from '../../lib/api/registrations';
import { Button } from '../ui';
import { AppAlert } from '../ui/AppAlert';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/** DPDP notice for the Assist bot: what it reads, where the chat goes, and the way out. */
export function AssistNotice() {
  const tokens = useTokens();
  return (
    <Text style={[styles.notice, { color: tokens.textMuted }]}>
      Assist is an AI helper and can get things wrong. To answer, it reads your bookings and refunds on Unifesto, and this chat
      is saved as a support request. A person can take over anytime.{' '}
      <Text style={{ color: tokens.accent }} onPress={() => Linking.openURL('https://unifesto.app/privacy-notice').catch(() => {})}>
        Privacy notice
      </Text>
    </Text>
  );
}

/**
 * Assist's action cards (D14). Assist only proposes; the person confirms here
 * and the app calls the same endpoint the ticket screen does.
 */
export function AssistActions({ actions, onDone }: { actions: AssistAction[]; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const run = (a: AssistAction) => {
    if (a.type === 'REQUEST_REFUND') {
      router.push({ pathname: '/refund/[registrationId]', params: { registrationId: a.registrationId, eventTitle: a.eventTitle } });
      return;
    }
    AppAlert.alert('Cancel this booking?', `${a.eventTitle}. ${a.label}.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          setBusy(a.registrationId);
          try {
            const res = await cancelMyRegistration(a.registrationId, 'Cancelled from Assist');
            AppAlert.alert('Done', res?.message || 'Your booking is cancelled.');
            onDone();
          } catch (e: any) {
            AppAlert.alert("Couldn't cancel", e.message || 'Please try again.');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.actions}>
      {actions.map((a) => (
        <Button
          key={`${a.type}:${a.registrationId}`}
          label={a.label}
          variant={a.type === 'CANCEL_BOOKING' ? 'danger' : 'secondary'}
          size="sm"
          loading={busy === a.registrationId}
          onPress={() => run(a)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  actions: { alignSelf: 'flex-start', gap: spacing[2], maxWidth: '85%' },
});
