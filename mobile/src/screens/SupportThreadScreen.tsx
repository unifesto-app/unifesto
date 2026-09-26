import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperPlaneRight } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useTopSpacing from '../hooks/useTopSpacing';
import { closeTicket, getTicket, reopenTicket, replyToTicket, STATUS_LABEL, type SupportTicket } from '../lib/api/support';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/** One support request: the conversation, a reply box, and close / reopen. */
export default function SupportThreadScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const scroll = useRef<ScrollView>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [missing, setMissing] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);

  useAnalyticsScreenTracking('SupportThread');

  const load = useCallback(async () => {
    if (!ticketId) return;
    const t = await getTicket(ticketId);
    if (t) setTicket(t);
    else setMissing(true);
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    const msg = await replyToTicket(ticketId!, body);
    setSending(false);
    if (!msg) return AppAlert.alert("Couldn't send", 'Check your connection and try again.');
    setReply('');
    await load();
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const toggle = async () => {
    setToggling(true);
    const ok = ticket!.status === 'CLOSED' ? await reopenTicket(ticketId!) : await closeTicket(ticketId!);
    setToggling(false);
    if (!ok) return AppAlert.alert("Couldn't update the request");
    await load();
  };

  if (!ticket) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {missing ? <Text style={[styles.meta, { color: tokens.textMuted }]}>This request couldn't be opened.</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const closed = ticket.status === 'CLOSED';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title: `#${ticket.ticketNumber}` }} />
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        <Text style={[styles.subject, { color: tokens.text }]}>{ticket.subject}</Text>
        <Text style={[styles.meta, { color: tokens.textMuted }]}>{STATUS_LABEL[ticket.status]}</Text>

        <View style={{ marginTop: spacing[5], gap: spacing[3] }}>
          {(ticket.messages ?? []).map((m) => {
            const staff = m.isStaffReply;
            return (
              <View key={m.id} style={[styles.bubble, staff ? styles.left : [styles.right, { backgroundColor: tokens.accent }]]}>
                {staff ? <CardBackdrop shape={styles.bubble} /> : null}
                <Text style={[styles.body, { color: staff ? tokens.text : tokens.accentFg }]}>{m.body}</Text>
                <Text style={[styles.time, { color: staff ? tokens.textMuted : tokens.accentFg, opacity: staff ? 1 : 0.7 }]}>
                  {staff ? 'Unifesto · ' : ''}
                  {stamp(m.createdAt)}
                </Text>
              </View>
            );
          })}
        </View>

        <Button
          label={closed ? 'Reopen request' : 'Mark as solved'}
          variant="ghost"
          loading={toggling}
          onPress={toggle}
          style={{ marginTop: spacing[6], alignSelf: 'center' }}
        />
      </ScrollView>

      {!closed ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]), backgroundColor: tokens.bg }]}>
          <View style={styles.inputWrap}>
            <CardBackdrop shape={styles.inputWrap} />
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder="Reply"
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
  bubble: { maxWidth: '85%', borderRadius: borderRadius.xl, overflow: 'hidden', paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...font() },
  time: { marginTop: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3], paddingHorizontal: GUTTER, paddingTop: spacing[3] },
  inputWrap: { flex: 1, borderRadius: borderRadius.xl, overflow: 'hidden', paddingHorizontal: spacing[4], paddingVertical: spacing[2], minHeight: 44, justifyContent: 'center' },
  input: { fontSize: typography.fontSize.base, maxHeight: 120, ...font() },
});
