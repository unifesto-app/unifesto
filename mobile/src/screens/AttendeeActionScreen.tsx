import { EMAIL_RE } from '../lib/constants';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cancelAttendee,
  getTransferRequestFor,
  requestAttendeeRefund,
  requestAttendeeTransfer,
  type TransferRequest,
} from '../lib/api/manageEvent';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

export type AttendeeAction = 'cancel' | 'refund' | 'transfer';

const COPY: Record<AttendeeAction, { title: string; intro: string; button: string; reasonLabel: string; reasonRequired: boolean }> = {
  cancel: {
    title: 'Cancel registration',
    intro: 'Their seat and tickets are released and they are told by WhatsApp and email. You can restore it later.',
    button: 'Cancel registration',
    reasonLabel: 'Reason (included in their email)',
    reasonRequired: false,
  },
  refund: {
    title: 'Refund',
    intro:
      "This ticket was paid for, so it's cancelled through a refund. A Unifesto admin approves it and returns the ticket price; the processing fee isn't refunded.",
    button: 'Send refund request',
    reasonLabel: 'Reason',
    reasonRequired: true,
  },
  transfer: {
    title: 'Transfer ticket',
    intro:
      'Ask a Unifesto admin to move this ticket to another account. The ticket, QR code, payment and group stay the same; only the holder changes. They need a Unifesto account.',
    button: 'Request transfer',
    reasonLabel: 'Note for the admin (optional)',
    reasonRequired: false,
  },
};

/**
 * The attendee actions that need typing: cancel (free/unpaid) with a reason,
 * a refund request for a paid ticket, and a transfer request by email.
 */
export default function AttendeeActionScreen() {
  const { eventId, registrationId, kind } = useLocalSearchParams<{ eventId: string; registrationId: string; kind: AttendeeAction }>();
  const action: AttendeeAction = kind === 'refund' || kind === 'transfer' ? kind : 'cancel';
  const copy = COPY[action];
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<TransferRequest | null>(null);

  useEffect(() => {
    if (action === 'transfer' && registrationId) void getTransferRequestFor(registrationId).then(setExisting);
  }, [action, registrationId]);

  const pendingTransfer = action === 'transfer' && existing?.status === 'PENDING';

  const submit = async () => {
    if (action === 'transfer' && !EMAIL_RE.test(email.trim())) {
      setError("Enter the new holder's email.");
      return;
    }
    if (copy.reasonRequired && !reason.trim()) {
      setError('Add a reason.');
      return;
    }
    setBusy(true);
    setError('');
    const r = reason.trim() || undefined;
    const res =
      action === 'cancel'
        ? await cancelAttendee(eventId!, registrationId!, r)
        : action === 'refund'
          ? await requestAttendeeRefund(registrationId!, r!)
          : await requestAttendeeTransfer(eventId!, registrationId!, email.trim(), r);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.back();
    if (action !== 'cancel') AppAlert.alert('Request sent', 'A Unifesto admin will review it.');
  };

  return (
    <CosmosScreen
      keyboard
      bottom={140 + insets.bottom}
      contentContainerStyle={styles.content}
      footer={!pendingTransfer ? <SaveBar visible label={copy.button} onPress={submit} loading={busy} error={error} /> : null}
    >
      <Stack.Screen options={{ title: copy.title }} />
      <Text style={[styles.intro, { color: c.soft }]}>{copy.intro}</Text>

      {existing && action === 'transfer' ? (
        <Text style={[styles.note, { color: existing.status === 'REJECTED' ? c.danger : c.soft }]}>
          {existing.status === 'PENDING'
            ? `Transfer to ${existing.targetEmail} is waiting for review.`
            : existing.status === 'APPROVED'
              ? `Last transfer to ${existing.targetEmail} was approved.`
              : `Last request was declined${existing.reviewNote ? `: ${existing.reviewNote}` : '.'}`}
        </Text>
      ) : null}

      {!pendingTransfer ? (
        <SettingsGroup plain>
          {action === 'transfer' ? (
            <FieldRow
              stacked
              label="New holder's email"
              value={email}
              onChangeText={(v) => {
                setError('');
                setEmail(v);
              }}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
          <FieldRow
            stacked
            multiline
            label={copy.reasonLabel}
            value={reason}
            onChangeText={(v) => {
              setError('');
              setReason(v);
            }}
          />
        </SettingsGroup>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  note: { marginTop: spacing[4], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
