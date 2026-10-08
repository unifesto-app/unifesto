import React, { useCallback, useRef, useState } from 'react';
import { buildLabel, type BuildInfo } from '../../lib/appBuild';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperPlaneRight } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import useTopSpacing from '../../hooks/useTopSpacing';
import { getAdminTicket, PRIORITY_LABEL, replyAsStaff, triageTicket, type AdminTicket } from '../../lib/api/apexSupport';
import { CATEGORY_LABEL, type SupportTicketPriority, type SupportTicketStatus } from '../../lib/api/support';
import { CardBackdrop } from '../../components/ui/CardSurface';
import { AppAlert } from '../../components/ui/AppAlert';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import ChipPicker from '../../components/manage/ChipPicker';
import { longDate } from '../../components/apex/ApexRow';
import { personName } from './SupportInboxScreen';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];

const STATUSES: { value: SupportTicketStatus; label: string }[] = [
  { value: 'OPEN', label: 'Needs reply' },
  { value: 'PENDING', label: 'Waiting on them' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const PRIORITIES = (Object.keys(PRIORITY_LABEL) as SupportTicketPriority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));

/**
 * One support ticket from Unifesto's side: triage (status, priority, owner),
 * who raised it, and the conversation with a staff reply box. Staff messages
 * sit on the right here, the reverse of the requester's view.
 */
export default function AdminSupportThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const scroll = useRef<ScrollView>(null);
  const [ticket, setTicket] = useState<AdminTicket | null>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  useAnalyticsScreenTracking('ApexSupportThread');

  const load = useCallback(async () => {
    if (!id) return;
    const r = await getAdminTicket(id);
    if (r.ok) {
      setTicket(r.data);
      setError('');
    } else setError(r.message);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const send = async () => {
    const body = reply.trim();
    if (!body || !ticket) return;
    setSending(true);
    const r = await replyAsStaff(ticket.id, body);
    setSending(false);
    if (!r.ok) return AppAlert.alert("Couldn't send", r.message);
    setReply('');
    await load();
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  // The PATCH response has no messages, so merge it over what we already show.
  const triage = async (patch: Parameters<typeof triageTicket>[1]) => {
    if (!ticket) return;
    setSaving(true);
    const r = await triageTicket(ticket.id, patch);
    setSaving(false);
    if (!r.ok) return AppAlert.alert("Couldn't update the ticket", r.message);
    setTicket((prev) => (prev ? { ...prev, ...r.data, messages: prev.messages } : r.data));
  };

  const pickOwner = () => {
    if (!ticket || !user) return;
    const mine = ticket.assignedToId === user.id;
    AppAlert.alert('Assigned to', ticket.assignedTo ? personName(ticket.assignedTo) : 'Nobody yet', [
      mine
        ? { text: 'Unassign me', onPress: () => void triage({ assignedToId: null }) }
        : { text: 'Assign to me', onPress: () => void triage({ assignedToId: user.id }) },
      ...(ticket.assignedToId && !mine ? [{ text: 'Unassign', onPress: () => void triage({ assignedToId: null }) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  if (!ticket) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.meta, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const closed = ticket.status === 'CLOSED';
  const email = ticket.contactEmail || ticket.requester?.identities?.[0]?.email || undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title: `#${ticket.ticketNumber}` }} />
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.subject, { color: tokens.text }]}>{ticket.subject}</Text>
        <Text style={[styles.meta, { color: tokens.textMuted }]}>
          {CATEGORY_LABEL[ticket.category]} · opened {longDate(ticket.createdAt)}
        </Text>

        <SettingsGroup plain>
          <SettingsRow
            label="From"
            value={personName(ticket.requester)}
            onPress={ticket.requester ? () => router.push(`/apex/users/${ticket.requester!.id}`) : undefined}
          />
          {email ? <SettingsRow label="Email" value={email} /> : null}
          {ticket.requester?.mobileNumber ? <SettingsRow label="Phone" value={ticket.requester.mobileNumber} /> : null}
          {ticket.clientInfo?.version ? (
            <SettingsRow
              label="App"
              value={`${buildLabel(ticket.clientInfo as BuildInfo)}${ticket.clientInfo.platform ? ` · ${ticket.clientInfo.platform}` : ''}`}
            />
          ) : null}
          {ticket.space ? (
            <SettingsRow label="Space" value={ticket.space.name} onPress={() => router.push(`/apex/spaces/${ticket.space!.id}`)} />
          ) : null}
          <SettingsRow label="Assigned to" value={ticket.assignedTo ? personName(ticket.assignedTo) : 'Nobody'} onPress={pickOwner} />
        </SettingsGroup>

        <Text style={[styles.label, { color: tokens.textMuted }]}>Status</Text>
        <ChipPicker options={STATUSES} value={ticket.status} onChange={(v) => v && v !== ticket.status && !saving && void triage({ status: v })} />
        <Text style={[styles.label, { color: tokens.textMuted }]}>Priority</Text>
        <ChipPicker options={PRIORITIES} value={ticket.priority} onChange={(v) => v && v !== ticket.priority && !saving && void triage({ priority: v })} />

        <View style={{ marginTop: spacing[6], gap: spacing[3] }}>
          {(ticket.messages ?? []).map((m) => {
            const staff = m.isStaffReply;
            return (
              <View key={m.id} style={[styles.bubble, staff ? [styles.right, { backgroundColor: tokens.accent }] : styles.left]}>
                {staff ? null : <CardBackdrop shape={styles.bubble} />}
                <Text style={[styles.body, { color: staff ? tokens.accentFg : tokens.text }]}>{m.body}</Text>
                <Text style={[styles.time, { color: staff ? tokens.accentFg : tokens.textMuted, opacity: staff ? 0.7 : 1 }]}>
                  {personName(m.author)} · {longDate(m.createdAt)}
                </Text>
              </View>
            );
          })}
        </View>

        {closed ? (
          <Text style={[styles.hint, { color: tokens.textMuted }]}>This ticket is closed. Set it back to Needs reply to answer.</Text>
        ) : null}
      </ScrollView>

      {!closed ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]), backgroundColor: tokens.bg }]}>
          <View style={styles.inputWrap}>
            <CardBackdrop shape={styles.inputWrap} />
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder="Reply as Unifesto"
              placeholderTextColor={tokens.textMuted}
              selectionColor={tokens.accent}
              multiline
              style={[styles.input, { color: tokens.text }]}
            />
          </View>
          <Pressable onPress={send} disabled={sending || !reply.trim()} hitSlop={8} accessibilityLabel="Send reply">
            {sending ? (
              <ActivityIndicator color={tokens.accent} />
            ) : (
              <PaperPlaneRight size={28} color={reply.trim() ? tokens.accent : tokens.textMuted} weight="fill" />
            )}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing[6] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  subject: { fontSize: typography.fontSize.xl, ...font('heading') },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  label: { marginTop: spacing[4], marginBottom: spacing[2], fontSize: typography.fontSize.sm, ...font('medium') },
  hint: { marginTop: spacing[6], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  bubble: { maxWidth: '85%', borderRadius: borderRadius.xl, overflow: 'hidden', paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...font() },
  time: { marginTop: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3], paddingHorizontal: GUTTER, paddingTop: spacing[3] },
  inputWrap: { flex: 1, borderRadius: borderRadius.xl, overflow: 'hidden', paddingHorizontal: spacing[4], paddingVertical: spacing[2], minHeight: 44, justifyContent: 'center' },
  input: { fontSize: typography.fontSize.base, maxHeight: 120, ...font() },
});
