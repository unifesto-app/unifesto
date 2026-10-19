import { EMAIL_RE } from '../../lib/constants';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import type { Decision, RequestStatus } from '../../lib/api/apex';
import { queueDef, recallQueueItem, titleCase, type QueueItem } from '../../lib/apexQueues';
import { longDate } from '../../components/apex/ApexRow';
import { FieldRow } from '../../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import { CardBackdrop } from '../../components/ui/CardSurface';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];
const STATUSES: RequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

const MIN_REJECT_NOTE = 10;

/**
 * Decide whether a rejection note is acceptable. Return an error message to
 * block the rejection, or null to let it through. The requester sees the note
 * (e.g. on "Request a space"), so a rejection must say what to fix — a bare
 * "no" just invites the same request again.
 */
function rejectNoteProblem(note: string): string | null {
  if (!note) return 'Tell them why, so they know what to fix.';
  if (note.length < MIN_REJECT_NOTE) return `Write a little more, at least ${MIN_REJECT_NOTE} characters.`;
  return null;
}

/** One request from any Apex queue: who asked, what for, approve / reject. */
export default function QueueReviewScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const def = queueDef(kind ?? '');
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [item, setItem] = useState<QueueItem | null>(() => (kind && id ? recallQueueItem(kind, id) ?? null : null));
  const [error, setError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<Decision | null>(null);

  useAnalyticsScreenTracking('ApexQueueReview');

  // Cold open (push, deep link): no GET-by-id exists, so scan the three lists.
  const lookup = useCallback(async () => {
    if (!def || !id) return;
    for (const status of STATUSES) {
      const res = await def.fetch(status);
      if (!res.ok) {
        setError(res.denied ? 'Only Unifesto platform admins can review this.' : res.message);
        return;
      }
      const hit = res.data.find((r) => r.id === id);
      if (hit) {
        setItem(hit);
        return;
      }
    }
    setError('This request no longer exists.');
  }, [def, id]);

  useEffect(() => {
    if (!item) void lookup();
  }, [item, lookup]);

  const act = async (decision: Decision) => {
    if (!def || !id) return;
    setBusy(decision);
    const res = await def.review(id, decision, note.trim() || undefined, email.trim() || undefined);
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't update", res.message);
      return;
    }
    router.back();
  };

  const confirmApprove = () => {
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      AppAlert.alert('Check the email', 'That doesn’t look like an email address.');
      return;
    }
    const effect = email.trim() ? `${item?.approveEffect} It goes to ${email.trim()} instead.` : item?.approveEffect;
    AppAlert.alert(`${def?.approveLabel}?`, effect, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => void act('APPROVED') },
    ]);
  };

  const confirmReject = () => {
    const problem = rejectNoteProblem(note.trim());
    if (problem) {
      AppAlert.alert('Add a note', problem);
      return;
    }
    AppAlert.alert('Reject this request?', 'They see it was turned down, with your note.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => void act('REJECTED') },
    ]);
  };

  if (!def || !item) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error || !def ? (
          <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'center' }]}>{error || 'Unknown queue.'}</Text>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const statusColor = item.status === 'APPROVED' ? tokens.success : item.status === 'REJECTED' ? tokens.danger : tokens.warning;
  const who = item.requester;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title: def.label }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: tokens.text }]}>{item.title}</Text>
        {item.subtitle ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{item.subtitle}</Text> : null}
        <Text style={[styles.status, { color: statusColor }]}>
          {item.status === 'PENDING' ? 'Waiting for review' : titleCase(item.status)}
        </Text>

        {item.reason ? (
          <View style={styles.quote}>
            <CardBackdrop shape={styles.quote} />
            <Text style={[styles.quoteText, { color: tokens.text }]}>“{item.reason}”</Text>
          </View>
        ) : null}

        {item.facts.length > 0 ? (
          <SettingsGroup title="Details" plain>
            {item.facts.map((f) => (
              <SettingsRow key={f.label} label={f.label} value={f.value} />
            ))}
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="Asked by" plain>
          <SettingsRow label="Name" value={who?.label ?? '—'} />
          {who?.phone ? <SettingsRow label="Phone" value={who.phone} onPress={() => void Linking.openURL(`tel:${who.phone}`)} /> : null}
          {who?.email ? <SettingsRow label="Email" value={who.email} onPress={() => void Linking.openURL(`mailto:${who.email}`)} /> : null}
          <SettingsRow label="Asked on" value={longDate(item.createdAt)} />
        </SettingsGroup>

        {item.reviewNote && item.status !== 'PENDING' ? (
          <Text style={[styles.note, { color: tokens.textSecondary }]}>Note: {item.reviewNote}</Text>
        ) : null}
        {item.warning && item.status === 'PENDING' ? <Text style={[styles.note, { color: tokens.warning }]}>{item.warning}</Text> : null}

        {item.status === 'PENDING' ? (
          rejecting ? (
            <>
              <SettingsGroup title="Why are you rejecting it?" plain>
                <FieldRow
                  stacked
                  multiline
                  label="Note (they see this)"
                  value={note}
                  onChangeText={setNote}
                  placeholder="e.g. We couldn't verify this."
                  autoFocus
                />
              </SettingsGroup>
              <Button label="Reject" variant="danger" size="lg" fullWidth loading={busy === 'REJECTED'} onPress={confirmReject} style={{ marginTop: spacing[6] }} />
              <Button label="Back" variant="ghost" size="lg" fullWidth disabled={busy !== null} onPress={() => setRejecting(false)} style={{ marginTop: spacing[2] }} />
            </>
          ) : (
            <>
              {def.emailOverride ? (
                <SettingsGroup title="Send somewhere else? (optional)" plain>
                  <FieldRow
                    stacked
                    label="Different email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Leave blank to use the requested one"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                  />
                </SettingsGroup>
              ) : null}
              <Button label={def.approveLabel} size="lg" fullWidth loading={busy === 'APPROVED'} onPress={confirmApprove} style={{ marginTop: spacing[8] }} />
              <Button label="Reject" variant="danger" size="lg" fullWidth disabled={busy !== null} onPress={() => setRejecting(true)} style={{ marginTop: spacing[3] }} />
            </>
          )
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...font() },
  title: { fontSize: typography.fontSize['2xl'], ...font('heading') },
  status: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('semibold') },
  quote: { marginTop: spacing[5], padding: spacing[4], borderRadius: 14 },
  quoteText: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...font('medium') },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
});
