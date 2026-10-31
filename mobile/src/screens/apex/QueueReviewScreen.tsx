import { EMAIL_RE } from '../../lib/constants';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { Decision, RequestStatus } from '../../lib/api/apex';
import { queueDef, recallQueueItem, titleCase, type QueueItem } from '../../lib/apexQueues';
import { longDate } from '../../components/apex/ApexRow';
import { FieldRow } from '../../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { CardBackdrop } from '../../components/ui/CardSurface';
import { GUTTER } from '../../components/home/Section';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../../theme/cosmos';

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
  const c = useCosmos();
  const [item, setItem] = useState<QueueItem | null>(() => (kind && id ? recallQueueItem(kind, id) ?? null : null));
  const [error, setError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<Decision | null>(null);

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
      <CosmosScreen contentContainerStyle={styles.content}>
        {error || !def ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.muted, { color: c.soft, textAlign: 'center', marginTop: 0 }]}>{error || 'Unknown queue.'}</Text>
            {def ? (
              <Button
                variant="secondary"
                label="Try again"
                onPress={() => {
                  setError('');
                  void lookup();
                }}
                style={{ marginTop: spacing[4] }}
              />
            ) : null}
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const statusColor = item.status === 'APPROVED' ? c.success : item.status === 'REJECTED' ? c.danger : c.warn;
  const who = item.requester;

  return (
    <CosmosScreen keyboard contentContainerStyle={styles.content} keyboardDismissMode="interactive">
      <Stack.Screen options={{ title: def.label }} />
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{item.title}</Text>
        {item.subtitle ? <Text style={[styles.muted, { color: c.muted }]}>{item.subtitle}</Text> : null}
        {/* The status as plain text with a dot, never a pill. */}
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={[styles.status, { color: statusColor }]}>
            {item.status === 'PENDING' ? 'Waiting for review' : titleCase(item.status)}
          </Text>
        </View>

        {item.reason ? (
          <View style={styles.quote}>
            <CardBackdrop shape={styles.quote} />
            <Text style={[styles.quoteText, { color: c.text }]}>“{item.reason}”</Text>
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
          <SettingsRow label="Name" value={who?.label ?? '–'} />
          {who?.phone ? <SettingsRow label="Phone" value={who.phone} onPress={() => void Linking.openURL(`tel:${who.phone}`)} /> : null}
          {who?.email ? <SettingsRow label="Email" value={who.email} onPress={() => void Linking.openURL(`mailto:${who.email}`)} /> : null}
          <SettingsRow label="Asked on" value={longDate(item.createdAt)} />
        </SettingsGroup>

        {item.reviewNote && item.status !== 'PENDING' ? (
          <Text style={[styles.note, { color: c.soft }]}>Note: {item.reviewNote}</Text>
        ) : null}
        {item.warning && item.status === 'PENDING' ? <Text style={[styles.note, { color: c.warn }]}>{item.warning}</Text> : null}

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
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  title: { fontSize: 26, lineHeight: 32, ...cosmosFont.display, letterSpacing: displayTracking(26) },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  quote: { marginTop: spacing[5], padding: spacing[5], borderRadius: cosmosCardRadius },
  quoteText: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.strong },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
});
