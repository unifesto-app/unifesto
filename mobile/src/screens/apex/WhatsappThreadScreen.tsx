import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperPlaneRight, Phone } from '@unifesto/unicon/react-native';
import useTopSpacing from '../../hooks/useTopSpacing';
import {
  conversationName,
  convertWhatsappToCase,
  getWhatsappConversation,
  messagePreview,
  replyWhatsapp,
  type WhatsappConversation,
  type WhatsappMessage,
} from '../../lib/api/apex';
import { whenShort } from '../../components/apex/ApexRow';
import { AppAlert } from '../../components/ui/AppAlert';
import { borderRadius, column, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { CardBackdrop } from '../../components/ui/CardSurface';
import CosmosBackdrop from '../../components/ui/CosmosBackdrop';
import { Button } from '../../components/ui';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

// While the thread is open, check for new messages this often.
const POLL_MS = 10_000;
const MAX_REPLY = 4096; // WhatsApp's text body limit

/**
 * One WhatsApp conversation. Opening it marks it read. Free-form replies only
 * work within 24h of their last message (Meta's rule); after that, reach them
 * with a template from Apex on the web.
 */
export default function WhatsappThreadScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const c = useCosmos();
  const topSpacing = useTopSpacing(8);
  const insets = useSafeAreaInsets();
  const [convo, setConvo] = useState<WhatsappConversation | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // D26: messages picked to copy into an Assist case; null until the first load pre-picks.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [converting, setConverting] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    const res = await getWhatsappConversation(id);
    inFlight.current = false;
    if (res.ok) {
      setConvo(res.data);
      // Pre-pick what's unanswered (inbound after our last reply), once, so polling keeps the admin's picks.
      setPicked((p) => {
        if (p) return p;
        const msgs = res.data.messages ?? [];
        const lastOut = msgs.map((m) => m.direction).lastIndexOf('OUTBOUND');
        return new Set(msgs.slice(lastOut + 1).filter((m) => m.direction === 'INBOUND').map((m) => m.id));
      });
      setError('');
    } else {
      setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
    }
  }, [id]);

  // Load now, then poll while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(t);
    }, [load]),
  );

  const send = async () => {
    const body = draft.trim();
    if (!body || !id) return;
    setSending(true);
    const res = await replyWhatsapp(id, body);
    setSending(false);
    if (!res.ok) {
      AppAlert.alert("Couldn't send", res.message);
      return;
    }
    setDraft('');
    await load();
  };

  const togglePick = (msgId: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(msgId)) next.add(msgId);
      return next;
    });

  const convert = async () => {
    if (!id || !picked?.size) return;
    setConverting(true);
    const res = await convertWhatsappToCase(id, [...picked]);
    setConverting(false);
    if (!res.ok) {
      AppAlert.alert("Couldn't open the case", res.message);
      return;
    }
    setConvo((c) => c && { ...c, caseId: res.data.caseId });
  };

  const title = convo ? conversationName(convo) : name || 'WhatsApp';
  const messages = [...(convo?.messages ?? [])].reverse(); // newest first for the inverted list
  const windowOpen = !!convo?.replyWindowOpen;
  const caseId = convo?.caseId;
  const pickCount = picked?.size ?? 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? topSpacing - 8 : 0}
    >
      <CosmosBackdrop horizon={false} />
      <Stack.Screen
        options={{
          title,
          headerRight: convo
            ? () => (
                <View style={styles.headerActions}>
                  {caseId ? (
                    <Pressable hitSlop={8} onPress={() => router.push(`/manage/support/${caseId}`)} accessibilityRole="button">
                      <Text style={[styles.headerAction, { color: c.text }]}>Open case</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      hitSlop={8}
                      onPress={() => void convert()}
                      disabled={!pickCount || converting}
                      accessibilityRole="button"
                      accessibilityHint="Tap messages to choose what goes into the case"
                      style={{ opacity: !pickCount || converting ? 0.4 : 1 }}
                    >
                      <Text style={[styles.headerAction, { color: c.text }]}>
                        {converting ? 'Opening…' : `Convert to case (${pickCount})`}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable hitSlop={12} onPress={() => void Linking.openURL(`tel:+${convo.waId}`)} accessibilityRole="button" accessibilityLabel="Call">
                    <Phone size={22} color={c.text} />
                  </Pressable>
                </View>
              )
            : undefined,
        }}
      />
      {!convo ? (
        <View style={styles.center}>
          {error ? (
            <View style={styles.empty}>
              <CardBackdrop shape={styles.empty} />
              <Text style={[styles.muted, { color: c.soft }]}>{error}</Text>
              <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
            </View>
          ) : (
            <ActivityIndicator color={c.text} />
          )}
        </View>
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[column, styles.list]}
          ListFooterComponent={<View style={{ height: topSpacing }} />}
          extraData={picked}
          renderItem={({ item }) => (
            <Bubble
              message={item}
              picked={!caseId && !!picked?.has(item.id)}
              onPick={caseId ? undefined : () => togglePick(item.id)}
            />
          )}
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        />
      )}

      {convo ? (
        windowOpen ? (
          <View style={[column, styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]), borderTopColor: c.border }]}>
            <View style={styles.inputWrap}>
              <CardBackdrop shape={styles.inputWrap} />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Reply on WhatsApp"
                placeholderTextColor={c.muted}
                multiline
                maxLength={MAX_REPLY}
                style={[styles.input, { color: c.text }]}
              />
            </View>
            <Pressable
              onPress={() => void send()}
              disabled={!draft.trim() || sending}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [styles.send, { opacity: !draft.trim() || sending ? 0.4 : pressed ? 0.6 : 1 }]}
            >
              {sending ? <ActivityIndicator color={c.text} /> : <PaperPlaneRight size={26} color={c.text} weight="fill" />}
            </Pressable>
          </View>
        ) : (
          <Text style={[column, styles.closed, { color: c.muted, paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
            It's been over 24 hours since their last message, so WhatsApp only allows a template now. Send one from Apex on the web.
          </Text>
        )
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, picked, onPick }: { message: WhatsappMessage; picked?: boolean; onPick?: () => void }) {
  const c = useCosmos();
  const mine = message.direction === 'OUTBOUND';
  const failed = mine && (message.status === 'failed' || !!message.errorText);
  const text = message.body || (message.mediaUrl ? '' : messagePreview(message));
  const tick = mine ? (failed ? 'Not sent' : message.status ? message.status.charAt(0).toUpperCase() + message.status.slice(1) : '') : '';
  return (
    <View style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
      <Pressable
        disabled={!onPick}
        onPress={onPick}
        accessibilityRole={onPick ? 'checkbox' : undefined}
        accessibilityState={onPick ? { checked: !!picked } : undefined}
        style={[styles.bubble, { backgroundColor: mine ? c.primary : c.raised, borderColor: picked ? c.text : 'transparent' }]}
      >
        {message.mediaUrl ? <Image source={{ uri: message.mediaUrl }} style={styles.media} contentFit="cover" /> : null}
        {text ? <Text style={[styles.body, { color: mine ? c.primaryFg : c.text }]}>{text}</Text> : null}
      </Pressable>
      <Text style={[styles.meta, { color: failed ? c.danger : c.muted, textAlign: mine ? 'right' : 'left' }]}>
        {[whenShort(message.createdAt), tick].filter(Boolean).join('  ·  ')}
        {failed && message.errorText ? `  ·  ${message.errorText}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: spacing[6] },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  headerAction: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  list: { paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  bubbleWrap: { marginVertical: spacing[1], maxWidth: '82%' },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  // Transparent 2px border always, so picking a message doesn't shift the layout.
  bubble: { borderRadius: cosmosCardRadius, borderWidth: 2, paddingHorizontal: spacing[3], paddingVertical: spacing[2], overflow: 'hidden' },
  media: { width: 220, height: 220, borderRadius: borderRadius.md, marginBottom: spacing[1] },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.35, ...cosmosFont.body },
  meta: { marginTop: 2, marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: { flex: 1, borderRadius: cosmosRadius },
  input: {
    minHeight: 40,
    maxHeight: 140,
    paddingHorizontal: spacing[4],
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: typography.fontSize.base,
    ...cosmosFont.body,
  },
  send: { height: 40, width: 40, alignItems: 'center', justifyContent: 'center' },
  closed: { paddingHorizontal: spacing[6], paddingTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, textAlign: 'center', ...cosmosFont.body },
});
