import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { cancelAccountDeletion } from '../lib/api/profile';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useTopSpacing from '../hooks/useTopSpacing';
import {
  assistStep,
  closeTicket,
  DESK_STATUS_LABEL,
  escalateTicket,
  getTicket,
  KIND_LABEL,
  reopenTicket,
  replyToTicket,
  STATUS_LABEL,
  type SupportMessage,
  type SupportTicket,
} from '../lib/api/support';
import { CaseMessages, Composer, GUTTER, personName, sideOf } from '../components/support/CaseThread';
import { AssistActions, AssistNotice } from '../components/support/AssistParts';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

/**
 * One Assist case. The person who raised it gets the conversation, a reply box
 * and close / reopen. Anyone else here is the space desk (its pushes land on
 * this route): replies and internal notes, Escalate to Unifesto, and read-only
 * once the case is with Unifesto.
 */
export default function SupportThreadScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const tokens = useTokens();
  const { user, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const scroll = useRef<ScrollView>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [missing, setMissing] = useState(false);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);

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
    // D14: in a bot chat Assist answers in the same call and returns the thread.
    if (ticket?.status === 'BOT') {
      const t = await assistStep(ticketId!, body);
      setSending(false);
      if (!t) return AppAlert.alert("Couldn't send", 'Check your connection and try again.');
      setReply('');
      setTicket(t);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
      return;
    }
    const msg = await replyToTicket(ticketId!, body, note);
    setSending(false);
    if (!msg) return AppAlert.alert("Couldn't send", 'Check your connection and try again.');
    setReply('');
    await load();
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  // D14: "Talk to a person" hands the bot chat to the desk.
  const talkToPerson = async () => {
    setActing(true);
    const t = await assistStep(ticketId!);
    setActing(false);
    if (!t) return AppAlert.alert("Couldn't reach the team", 'Check your connection and try again.');
    setTicket(t);
  };

  const toggle = async () => {
    setActing(true);
    const ok = ticket!.status === 'CLOSED' ? await reopenTicket(ticketId!) : await closeTicket(ticketId!);
    setActing(false);
    if (!ok) return AppAlert.alert("Couldn't update the request");
    await load();
  };

  // D24: my account deletion's case; while it's pending I can keep the account from here.
  const keepAccount = () =>
    AppAlert.alert('Keep my account?', 'The deletion is cancelled and the account stays as it is.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Keep my account',
        onPress: async () => {
          setActing(true);
          try {
            await cancelAccountDeletion();
            updateUser({ deletionScheduledFor: null });
            await load();
          } catch (e: any) {
            AppAlert.alert("Couldn't cancel the deletion", e.message || 'Please try again.');
          } finally {
            setActing(false);
          }
        },
      },
    ]);

  const escalate = () =>
    AppAlert.alert('Escalate to Unifesto?', 'You will still be able to read it, but only Unifesto replies.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Escalate',
        onPress: async () => {
          setActing(true);
          const r = await escalateTicket(ticketId!);
          setActing(false);
          if (!r.ok) return AppAlert.alert("Couldn't escalate", r.message);
          await load();
        },
      },
    ]);

  if (!ticket) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {missing ? <Text style={[styles.meta, { color: tokens.textMuted }]}>This request couldn't be opened.</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const closed = ticket.status === 'CLOSED';
  const bot = ticket.status === 'BOT';
  const asDesk = !!user && ticket.requesterId !== user.id;
  const withUnifesto = ticket.desk === 'PLATFORM';
  const spaceName = ticket.space?.name ?? 'The organiser';

  // Requester view: who answered for the desk then. The organiser while the
  // case sat on the space desk, Unifesto otherwise.
  // ponytail: a case Unifesto sent to the organiser labels Unifesto's earlier replies with the space; store the desk per message if that confuses.
  const onSpaceDesk = (iso: string) => !!ticket.space && (!withUnifesto || (!!ticket.escalatedAt && iso < ticket.escalatedAt));
  const nameOf = (m: SupportMessage) => {
    const side = sideOf(m);
    if (side === 'ASSISTANT') return 'Assist';
    if (asDesk) return side === 'REQUESTER' ? personName(ticket.requester) : personName(m.author);
    return side === 'DESK' ? (onSpaceDesk(m.createdAt) ? spaceName : 'Unifesto') : '';
  };

  const email = ticket.contactEmail || ticket.requester?.identities?.[0]?.email;
  const meta = asDesk
    ? [personName(ticket.requester), email, DESK_STATUS_LABEL[ticket.status]]
    : [KIND_LABEL[ticket.kind], STATUS_LABEL[ticket.status], withUnifesto ? 'With Unifesto' : `With ${spaceName}`];
  // The desk can write while the case is on it; the requester until it closes.
  const canWrite = !closed && (!asDesk || !withUnifesto);
  const deletionPending =
    !asDesk && ticket.kind === 'PRIVACY' && ticket.subjectType === 'User' && !!user?.deletionScheduledFor;

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
        <Text style={[styles.meta, { color: tokens.textMuted }]}>{meta.filter(Boolean).join(' · ')}</Text>

        <View style={{ marginTop: spacing[5] }}>
          <CaseMessages
            messages={ticket.messages ?? []}
            viewer={asDesk ? 'DESK' : 'REQUESTER'}
            nameOf={nameOf}
            after={(m) => (!asDesk && bot && m.actions?.length ? <AssistActions actions={m.actions} onDone={load} /> : null)}
          />
        </View>

        {asDesk ? (
          withUnifesto ? (
            <Text style={[styles.hint, { color: tokens.textMuted }]}>This case is with Unifesto now. You can read it, but only Unifesto replies.</Text>
          ) : !closed ? (
            <Button label="Escalate to Unifesto" variant="ghost" loading={acting} onPress={escalate} style={styles.action} />
          ) : (
            <Text style={[styles.hint, { color: tokens.textMuted }]}>This case is closed.</Text>
          )
        ) : bot ? (
          <View style={styles.assist}>
            <Button label="Talk to a person" variant="ghost" loading={acting} onPress={talkToPerson} />
            <AssistNotice />
          </View>
        ) : deletionPending ? (
          <Button label="Keep my account" variant="ghost" loading={acting} onPress={keepAccount} style={styles.action} />
        ) : (
          <Button label={closed ? 'Reopen request' : 'Mark as solved'} variant="ghost" loading={acting} onPress={toggle} style={styles.action} />
        )}
      </ScrollView>

      {canWrite ? (
        <Composer
          value={reply}
          onChangeText={setReply}
          onSend={send}
          sending={sending}
          placeholder={bot ? 'Ask Assist' : 'Reply'}
          note={asDesk ? { on: note, set: setNote } : undefined}
          bottomInset={insets.bottom}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing[6] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  subject: { fontSize: typography.fontSize.xl, ...font('heading') },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  hint: { marginTop: spacing[6], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  action: { marginTop: spacing[6], alignSelf: 'center' },
  assist: { marginTop: spacing[6], alignItems: 'center', gap: spacing[3] },
});
