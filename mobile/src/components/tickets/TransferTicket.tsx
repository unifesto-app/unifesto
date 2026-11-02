import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PaperPlaneTilt } from '@unifesto/unicon/react-native';
import { SettingsGroup, SettingsRow } from '../profile/SettingsGroup';
import { FieldRow } from '../manage/FormFields';
import { Button } from '../ui';
import { AppAlert } from '../ui/AppAlert';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Q17: "Transfer ticket" on my free ticket when the organiser allows it. A row
 * that opens an email field; sending asks once more, since it can't be undone.
 */
export default function TransferTicket({
  title,
  onTransfer,
}: {
  title: string;
  onTransfer: (email: string) => Promise<boolean>;
}) {
  const c = useCosmos();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const to = email.trim();

  if (!open) {
    return (
      <SettingsGroup flat>
        <SettingsRow icon={<PaperPlaneTilt size={24} color={c.sky} />} label="Transfer ticket" onPress={() => setOpen(true)} />
      </SettingsGroup>
    );
  }

  const send = () =>
    AppAlert.alert('Send this ticket?', `${title} goes to ${to}. Your QR stops working and you can't undo this.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Send ticket',
        onPress: async () => {
          setBusy(true);
          const ok = await onTransfer(to);
          if (!ok) setBusy(false);
        },
      },
    ]);

  return (
    <View>
      <SettingsGroup title="Transfer ticket" plain>
        <FieldRow
          stacked
          label="Their email"
          value={email}
          onChangeText={setEmail}
          placeholder="friend@college.edu"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      </SettingsGroup>
      <Text style={[styles.hint, { color: c.muted }]}>They need a Unifesto account with this email.</Text>
      <Button label="Send ticket" size="lg" fullWidth loading={busy} disabled={!EMAIL.test(to)} onPress={send} style={{ marginTop: spacing[4] }} />
      <Button
        label="Cancel"
        variant="ghost"
        size="lg"
        fullWidth
        disabled={busy}
        onPress={() => {
          setOpen(false);
          setEmail('');
        }}
        style={{ marginTop: spacing[2] }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
